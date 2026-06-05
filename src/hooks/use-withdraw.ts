import { useCallback, useRef, useState } from "react";
import { useOmniston } from "@ston-fi/omniston-sdk-react";
import { isHtlcOrderQuote, type Quote } from "@ston-fi/omniston-sdk";
import { type Address } from "viem";
import { base } from "viem/chains";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { generateHtlcHashlock, generateHtlcSecret } from "@/lib/htlc";
import { baseChainAddress, tonChainAddress } from "@/lib/omniston";
import {
  encodeCompactSignature,
  encodeOrder,
  signOrderTypedData,
  signUsdcPermit,
} from "@/lib/evm-order";
import { withdrawFromAave } from "@/lib/aave";

export type WithdrawStage =
  | "idle"
  | "withdrawing" // Aave withdraw → USDC on EOA
  | "ordering" // permit + build + sign + register the Omniston order
  | "settling" // HTLC settling → USDT arrives on TON
  | "done"
  | "error";

export interface WithdrawState {
  stage: WithdrawStage;
  error: string | null;
}

const INITIAL: WithdrawState = { stage: "idle", error: null };

/**
 * Orchestrates withdraw: Aave withdraw → USDC on Base → Omniston HTLC order →
 * USDT-TON.
 *
 * Steps:
 *  1. pool.withdraw(USDC, amount, owner) — USDC lands on the EOA.
 *  2. Sign an EIP-2612 permit so Omniston can pull the USDC without a separate
 *     approval tx (plan §6).
 *  3. Build the EVM order payload (permit + HTLC secrets), sign the EIP-712
 *     order, register the signed order.
 *  4. Track the order; disclose HTLC secrets once the resolver locks USDT on
 *     TON — releasing the funds to the user's TON wallet.
 */
export function useWithdraw() {
  const omniston = useOmniston();
  const { evmAddress, tonAddress, getEvmWalletClient } = useDynamicWallet();
  const [state, setState] = useState<WithdrawState>(INITIAL);
  const trackUnsubRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    trackUnsubRef.current?.();
    trackUnsubRef.current = null;
    setState(INITIAL);
  }, []);

  const runWithdraw = useCallback(
    async (quote: Quote, usdcBaseUnits: bigint) => {
      if (!evmAddress || !tonAddress) {
        setState({ stage: "error", error: "Wallet not ready. Sign in again." });
        return;
      }
      if (!isHtlcOrderQuote(quote)) {
        setState({
          stage: "error",
          error: "Expected an HTLC order quote for cross-chain bridge.",
        });
        return;
      }

      const baseAddr = baseChainAddress(evmAddress);
      const tonAddr = tonChainAddress(tonAddress);

      try {
        const walletClient = await getEvmWalletClient(String(base.id));

        // --- 1. Withdraw USDC from Aave to the EOA ---
        setState({ stage: "withdrawing", error: null });
        await withdrawFromAave(walletClient, evmAddress, usdcBaseUnits);

        // --- 2. EIP-2612 permit so Omniston can pull the USDC ---
        setState({ stage: "ordering", error: null });
        const spender = quote.settlementData.value.srcProtocolContractAddress
          .chain.value as Address;
        const permit = await signUsdcPermit(
          walletClient,
          evmAddress,
          spender,
          BigInt(quote.inputUnits),
        );

        // --- 3. Build order payload (permit + HTLC secrets), sign, register ---
        const secrets = [generateHtlcSecret()];
        const hashlocks = secrets.map((s) =>
          generateHtlcHashlock(
            s,
            quote.settlementData.value.htlcHashingFunction,
          ),
        );

        const payload = await omniston.evmBuildOrderPayload({
          quoteId: quote.quoteId,
          ownerSrcAddress: baseAddr,
          traderDstAddress: tonAddr,
          traderDstDiscloseAddress: tonAddr,
          usePermit2: false,
          permitSignature: permit.permitSignature,
          encodedPermitData: permit.encodedPermitData,
          htlcSecrets: {
            secretMode: { $case: "provided", value: { hashes: hashlocks } },
          },
        });

        const { typedData, signature } = await signOrderTypedData(
          walletClient,
          evmAddress,
          payload.typedData,
        );

        await omniston.orderRegisterSignedOrder({
          quoteId: quote.quoteId,
          ownerSrcAddress: baseAddr,
          signedOrder: {
            order: {
              $case: "evmV1",
              value: {
                encodedOrder: encodeOrder(typedData),
                signature: encodeCompactSignature(signature),
                orderExtension: payload.orderExtension,
              },
            },
          },
          serializedOrderDetails: payload.serializedOrderDetails,
        });

        // --- 4. Track settlement + disclose secrets ---
        setState({ stage: "settling", error: null });
        const disclosed = secrets.map(() => false);

        const stream = omniston.orderTrack({
          quoteId: quote.quoteId,
          traderAddress: baseAddr,
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
                void omniston.orderDiscloseHtlcSecret({
                  quoteId: quote.quoteId,
                  executionIndex: i,
                  secret,
                });
                disclosed[i] = true;
              }
            });

            const status = event.value.status;
            if (
              status === "TRADE_STATUS_FULLY_FILLED" ||
              status === "TRADE_STATUS_PARTIALLY_FILLED"
            ) {
              subscription.unsubscribe();
              trackUnsubRef.current = null;
              setState({ stage: "done", error: null });
            } else if (
              status === "TRADE_STATUS_CANCELLED" ||
              status === "TRADE_STATUS_FAILED"
            ) {
              subscription.unsubscribe();
              trackUnsubRef.current = null;
              setState({
                stage: "error",
                error: "The cross-chain order did not complete.",
              });
            }
          },
          error: (err) => {
            console.error("orderTrack error", err);
          },
        });
        trackUnsubRef.current = () => subscription.unsubscribe();
      } catch (e) {
        console.error("withdraw failed", e);
        trackUnsubRef.current?.();
        trackUnsubRef.current = null;
        setState({
          stage: "error",
          error: e instanceof Error ? e.message : "Withdraw failed.",
        });
      }
    },
    [omniston, evmAddress, tonAddress, getEvmWalletClient],
  );

  return { state, runWithdraw, reset };
}
