import { isHtlcOrderQuote, type Quote } from "@ston-fi/omniston-sdk";
import { useOmniston } from "@ston-fi/omniston-sdk-react";
import { useCallback, useRef, useState } from "react";
import { base } from "viem/chains";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import {
  approveAndSupply,
  readUsdcBalance,
  USDC_DECIMALS,
  waitForUsdcArrival,
} from "@/lib/aave";
import {
  bytesToHex,
  clearPendingDeposit,
  savePendingDeposit,
} from "@/lib/deposit-store";
import { generateHtlcHashlock, generateHtlcSecret } from "@/lib/htlc";
import { baseChainAddress, hexToBase64, tonChainAddress } from "@/lib/omniston";

/**
 * The ONLY execution phases at which it is safe to disclose the HTLC secret.
 *
 * Per the Omniston SDK docs, `EXECUTION_PHASE_CREATED` means the output position
 * is merely reserved and its creation tx may NOT yet have on-chain finality (it
 * can still be reverted). Disclosing then would let the resolver claim our USDT
 * while the output can still roll back = irreversible loss. Only the
 * READY_FOR_*_COMPLETION phases guarantee on-chain finality ("can no longer be
 * reverted"), so we disclose ONLY then — strictly safer than gating on "any
 * recognized phase". Verified against @ston-fi/omniston-sdk ExecutionPhase docs.
 */
const SAFE_TO_DISCLOSE_PHASES = new Set([
  "EXECUTION_PHASE_READY_FOR_PRIVATE_COMPLETION",
  "EXECUTION_PHASE_READY_FOR_PUBLIC_COMPLETION",
]);

/** Stages the deposit UI surfaces, in order. */
export type DepositStage =
  | "idle"
  | "bridging" // signing + sending the TON escrow transfer
  | "settling" // HTLC settling, waiting for USDC on Base
  | "supplying" // approving + supplying USDC to Aave
  | "done"
  | "error";

export interface DepositState {
  stage: DepositStage;
  error: string | null;
  supplyTxHash: string | null;
  /** USDC actually received on Base (after the bridge), human units. */
  receivedUsdc: number | null;
}

const INITIAL: DepositState = {
  stage: "idle",
  error: null,
  supplyTxHash: null,
  receivedUsdc: null,
};

/**
 * Orchestrates the full deposit: USDT-TON → Omniston HTLC → USDC on Base →
 * Aave supply.
 *
 * Steps:
 *  1. Build the TON escrow transfer (HTLC) from the quote, generating secrets.
 *  2. Sign + send it via Dynamic's TON wallet → escrow funded on TON.
 *  3. Track the order; disclose each HTLC secret once the resolver has locked
 *     the matching output on Base (outputPositionPhase set). This releases the
 *     USDC to our EOA.
 *  4. Poll the EOA until the bridged USDC lands.
 *  5. Approve + supply that USDC to Aave (aUSDC starts accruing yield).
 */
export function useDeposit() {
  const omniston = useOmniston();
  const {
    evmAddress,
    tonAddress,
    tonWallet,
    sendTonMessages,
    getEvmWalletClient,
  } = useDynamicWallet();
  const [state, setState] = useState<DepositState>(INITIAL);
  const trackUnsubRef = useRef<(() => void) | null>(null);
  // Hard re-entry guard: a second runDeposit while one is in flight must NEVER
  // fund a second escrow (double-spend). State-based `running` guards the UI,
  // but a ref guards against rapid double-taps / races before state settles.
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    trackUnsubRef.current?.();
    trackUnsubRef.current = null;
    inFlightRef.current = false;
    setState(INITIAL);
  }, []);

  const runDeposit = useCallback(
    async (quote: Quote) => {
      if (inFlightRef.current) return; // already depositing — ignore re-entry
      inFlightRef.current = true;
      if (!evmAddress || !tonAddress || !tonWallet) {
        inFlightRef.current = false; // pre-funding failure — allow retry
        setState({
          ...INITIAL,
          stage: "error",
          error: "Wallet not ready. Sign in again.",
        });
        return;
      }
      if (!isHtlcOrderQuote(quote)) {
        inFlightRef.current = false; // pre-funding failure — allow retry
        setState({
          ...INITIAL,
          stage: "error",
          error: "Expected an HTLC order quote for cross-chain bridge.",
        });
        return;
      }

      const tonAddr = tonChainAddress(tonAddress);
      const baseAddr = baseChainAddress(evmAddress);

      try {
        // --- 1. Build the HTLC escrow transfer on TON ---
        setState({ ...INITIAL, stage: "bridging" });

        // Single-execution HTLC (one secret). The plan bridges a single amount,
        // not chunked partial fills.
        const secrets = [generateHtlcSecret()];
        const hashlocks = secrets.map((s) =>
          generateHtlcHashlock(
            s,
            quote.settlementData.value.htlcHashingFunction,
          ),
        );

        const { messages } = await omniston.tonBuildEscrowTransfer({
          quoteId: quote.quoteId,
          ownerSrcAddress: tonAddr,
          transferSrcAddress: tonAddr,
          refundSrcAddress: tonAddr,
          gasExcessAddress: tonAddr,
          traderDstAddress: baseAddr,
          htlcSecrets: {
            secretMode: { $case: "provided", value: { hashes: hashlocks } },
          },
        });

        // Read the starting USDC balance BEFORE funding, so the arrival delta is
        // measured from the true pre-bridge baseline.
        const startUsdc = await readUsdcBalance(evmAddress);

        // CRITICAL: persist the secret + order context BEFORE the funds leave the
        // wallet. The secret is the only key to the escrowed USDT; if the app is
        // interrupted between funding and disclosure, this record lets us resume
        // tracking/disclosure (or recover via the on-chain refund). Persisting
        // first means we never have funds in escrow with the secret lost.
        savePendingDeposit({
          quoteId: quote.quoteId,
          secretsHex: secrets.map(bytesToHex),
          traderTonAddress: tonAddress,
          evmAddress,
          quotedOutputUnits: quote.outputUnits,
          createdAt: nowSeconds() * 1000,
        });

        // --- 2. Sign + send via Dynamic's TON wallet ---
        // Payloads/stateInit are hex BoCs that must be base64-encoded for the
        // TonConnect message shape.
        await sendTonMessages(
          messages.map((m) => ({
            address: m.targetAddress,
            amount: m.sendAmount,
            payload: m.payload ? hexToBase64(m.payload) : undefined,
            stateInit: m.jettonWalletStateInit
              ? hexToBase64(m.jettonWalletStateInit)
              : undefined,
          })),
          nowSeconds() + 5 * 60,
        );

        // --- 3. Track settlement + disclose secrets ---
        setState((s) => ({ ...s, stage: "settling" }));

        const disclosed = secrets.map(() => false);

        const stream = omniston.orderTrack({
          quoteId: quote.quoteId,
          traderAddress: tonAddr,
        });
        const subscription = stream.subscribe({
          next: (event) => {
            if (event?.$case !== "order") return;
            event.value.executions.forEach((execution, i) => {
              const secret = secrets[i];
              if (
                secret &&
                !disclosed[i] &&
                execution.outputPositionPhase &&
                // Only disclose once the output has reached ON-CHAIN FINALITY
                // (READY_FOR_*_COMPLETION) — NOT on CREATED, which can still
                // revert and would let the resolver claim without delivering.
                SAFE_TO_DISCLOSE_PHASES.has(execution.outputPositionPhase)
              ) {
                // Resolver locked the USDC on Base with finality — reveal the
                // secret so it can claim our USDT and release our USDC.
                void omniston.orderDiscloseHtlcSecret({
                  quoteId: quote.quoteId,
                  executionIndex: i,
                  secret,
                });
                disclosed[i] = true;
              }
            });
          },
          error: (err) => {
            console.error("orderTrack error", err);
          },
        });
        trackUnsubRef.current = () => subscription.unsubscribe();

        // --- 4. Wait for USDC to land on Base ---
        // Accept a generous lower bound (90% of quoted output) to tolerate fees
        // and rounding; the resolver pays exactly the quoted amount on success.
        const quotedOut = BigInt(quote.outputUnits);
        const minDelta = (quotedOut * 90n) / 100n;
        let received: bigint;
        try {
          received = await waitForUsdcArrival(evmAddress, startUsdc, minDelta);
        } catch {
          // Timed out waiting for USDC. This is NOT necessarily a loss: the
          // bridge may still settle (funds mid-flight) and the persisted record
          // keeps the secret recoverable. Surface a non-destructive "pending"
          // error instead of implying the funds vanished. We do NOT clear the
          // pending-deposit record here.
          subscription.unsubscribe();
          trackUnsubRef.current = null;
          inFlightRef.current = false;
          setState((s) => ({
            ...s,
            stage: "error",
            error:
              "Still settling. Your USDT is bridging — this can take a few minutes. Your funds are safe; check your balance shortly. If USDC doesn't arrive, it auto-refunds to your TON wallet.",
          }));
          return;
        }

        subscription.unsubscribe();
        trackUnsubRef.current = null;

        // --- 5. Supply the received USDC to Aave ---
        setState((s) => ({
          ...s,
          stage: "supplying",
          receivedUsdc: Number(formatUsdc(received)),
        }));

        const walletClient = await getEvmWalletClient(String(base.id));
        // Supply exactly what arrived (not the quote) to avoid dust mismatches.
        const supplyHash = await approveAndSupply(
          walletClient,
          evmAddress,
          received,
        );

        // Swap + supply both succeeded — the bridge is fully settled, so the
        // persisted record is no longer needed.
        clearPendingDeposit(quote.quoteId);

        inFlightRef.current = false;
        setState((s) => ({
          ...s,
          stage: "done",
          supplyTxHash: supplyHash,
        }));
      } catch (e) {
        console.error("deposit failed", e);
        trackUnsubRef.current?.();
        trackUnsubRef.current = null;
        inFlightRef.current = false;
        setState((s) => ({
          ...s,
          stage: "error",
          error: e instanceof Error ? e.message : "Deposit failed.",
        }));
      }
    },
    [
      omniston,
      evmAddress,
      tonAddress,
      tonWallet,
      sendTonMessages,
      getEvmWalletClient,
    ],
  );

  return { state, runDeposit, reset };
}

// Avoid Date.now() typing friction; this is fine in the browser runtime.
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function formatUsdc(raw: bigint): string {
  // 6-decimal USDC -> human string.
  return (Number(raw) / 10 ** USDC_DECIMALS).toString();
}
