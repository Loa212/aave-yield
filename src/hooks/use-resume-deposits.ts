import { useOmniston } from "@ston-fi/omniston-sdk-react";
import { useEffect, useRef } from "react";
import {
  clearPendingDeposit,
  getPendingDeposits,
  hexToBytes,
} from "@/lib/deposit-store";
import { tonChainAddress } from "@/lib/omniston";

// Same finality gate as use-deposit.ts — only disclose once the output can no
// longer be reverted.
const SAFE_TO_DISCLOSE_PHASES = new Set([
  "EXECUTION_PHASE_READY_FOR_PRIVATE_COMPLETION",
  "EXECUTION_PHASE_READY_FOR_PUBLIC_COMPLETION",
]);

// Final trade statuses (from @ston-fi/omniston-sdk TradeStatus + the SDK's
// reference example): once reached, there's nothing left to track/recover.
const FINAL_STATUSES = new Set([
  "TRADE_STATUS_FULLY_FILLED",
  "TRADE_STATUS_PARTIALLY_FILLED",
  "TRADE_STATUS_CANCELLED",
  "TRADE_STATUS_FAILED",
]);

/**
 * On app load, resume any deposit that was interrupted between funding the TON
 * escrow and disclosing its HTLC secret. Without this, a tab close / crash in
 * that window strands the funds (the secret lived only in memory). We re-track
 * each pending order and disclose at the safe (finalized) phase, exactly like
 * the live deposit flow, so an interrupted bridge still completes.
 *
 * Clears the record once the order reaches a final status.
 */
export function useResumePendingDeposits() {
  const omniston = useOmniston();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const pending = getPendingDeposits();
    if (pending.length === 0) return;

    const unsubs: Array<() => void> = [];

    for (const dep of pending) {
      const secrets = dep.secretsHex.map(hexToBytes);
      const disclosed = secrets.map(() => false);
      const traderAddr = tonChainAddress(dep.traderTonAddress);

      const stream = omniston.orderTrack({
        quoteId: dep.quoteId,
        traderAddress: traderAddr,
      });
      const sub = stream.subscribe({
        next: (event) => {
          if (event?.$case !== "order") return;
          event.value.executions.forEach((execution, i) => {
            const secret = secrets[i];
            if (
              secret &&
              !disclosed[i] &&
              execution.outputPositionPhase &&
              SAFE_TO_DISCLOSE_PHASES.has(execution.outputPositionPhase)
            ) {
              void omniston.orderDiscloseHtlcSecret({
                quoteId: dep.quoteId,
                executionIndex: i,
                secret,
              });
              disclosed[i] = true;
            }
          });

          // Once the order is final (filled or refunded), stop tracking and
          // drop the record — there's nothing left to recover.
          if (FINAL_STATUSES.has(event.value.status)) {
            clearPendingDeposit(dep.quoteId);
            sub.unsubscribe();
          }
        },
        error: (err) => {
          console.error("resume orderTrack error", dep.quoteId, err);
        },
      });
      unsubs.push(() => sub.unsubscribe());
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [omniston]);
}
