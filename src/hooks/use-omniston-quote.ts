import {
  type Quote,
  type QuoteRequest,
  SettlementMethod,
  useRfq,
} from "@ston-fi/omniston-sdk-react";
import { useMemo } from "react";
import { parseUnits } from "viem";
import { USDC_DECIMALS } from "@/lib/aave";
import { ASSET_USDC_BASE, ASSET_USDT_TON } from "@/lib/omniston";

// USDT on TON has 6 decimals (matches USDC). Kept local since it's the only TON
// asset we touch.
export const USDT_TON_DECIMALS = 6;

export type BridgeDirection = "deposit" | "withdraw";

/**
 * Cross-chain quote for a bridge leg.
 *
 * - deposit:  USDT-TON (input) → USDC-Base (output)
 * - withdraw: USDC-Base (input) → USDT-TON (output)
 *
 * We request ORDER settlement only — STON.fi cross-chain EVM is HTLC-only, no
 * instant swap (per PLAN.md settlement model). The quote streams in over a
 * WebSocket observable; useRfq surfaces the latest `quoteUpdated` event.
 */
export function useOmnistonQuote(
  direction: BridgeDirection,
  /** Human amount of the INPUT asset (USDT for deposit, USDC for withdraw). */
  inputAmount: string,
) {
  const quoteRequest = useMemo<QuoteRequest | undefined>(() => {
    const amountNum = Number(inputAmount);
    if (!inputAmount || Number.isNaN(amountNum) || amountNum <= 0) {
      return undefined;
    }

    const isDeposit = direction === "deposit";
    const inputAsset = isDeposit ? ASSET_USDT_TON : ASSET_USDC_BASE;
    const outputAsset = isDeposit ? ASSET_USDC_BASE : ASSET_USDT_TON;
    const inputDecimals = isDeposit ? USDT_TON_DECIMALS : USDC_DECIMALS;

    return {
      inputAsset,
      outputAsset,
      amount: {
        $case: "inputUnits",
        value: parseUnits(inputAmount, inputDecimals).toString(),
      },
      settlementParams: [{ params: { $case: "order", value: {} } }],
    } satisfies QuoteRequest;
  }, [direction, inputAmount]);

  const result = useRfq(quoteRequest!, {
    enabled: quoteRequest !== undefined,
  });

  const quote: Quote | undefined =
    result.data?.$case === "quoteUpdated" ? result.data.value : undefined;

  const noQuote = result.data?.$case === "noQuote";

  return { ...result, quote, noQuote, quoteRequest };
}

export { SettlementMethod };
