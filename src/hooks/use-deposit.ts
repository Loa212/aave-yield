import { useCallback, useRef, useState } from "react";
import { useOmniston } from "@ston-fi/omniston-sdk-react";
import { isHtlcOrderQuote, type Quote } from "@ston-fi/omniston-sdk";
import { base } from "viem/chains";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { generateHtlcHashlock, generateHtlcSecret } from "@/lib/htlc";
import {
  baseChainAddress,
  hexToBase64,
  tonChainAddress,
} from "@/lib/omniston";
import {
  USDC_DECIMALS,
  approveAndSupply,
  readUsdcBalance,
  waitForUsdcArrival,
} from "@/lib/aave";

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
  const { evmAddress, tonAddress, tonWallet, sendTonMessages, getEvmWalletClient } =
    useDynamicWallet();
  const [state, setState] = useState<DepositState>(INITIAL);
  const trackUnsubRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    trackUnsubRef.current?.();
    trackUnsubRef.current = null;
    setState(INITIAL);
  }, []);

  const runDeposit = useCallback(
    async (quote: Quote) => {
      if (!evmAddress || !tonAddress || !tonWallet) {
        setState({
          ...INITIAL,
          stage: "error",
          error: "Wallet not ready. Sign in again.",
        });
        return;
      }
      if (!isHtlcOrderQuote(quote)) {
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

        const startUsdc = await readUsdcBalance(evmAddress);
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
                execution.outputPositionPhase !== "UNRECOGNIZED"
              ) {
                // Resolver locked the USDC on Base — reveal the secret to claim.
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
        const received = await waitForUsdcArrival(
          evmAddress,
          startUsdc,
          minDelta,
        );

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

        setState((s) => ({
          ...s,
          stage: "done",
          supplyTxHash: supplyHash,
        }));
      } catch (e) {
        console.error("deposit failed", e);
        trackUnsubRef.current?.();
        trackUnsubRef.current = null;
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
