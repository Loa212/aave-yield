import { Omniston } from "@ston-fi/omniston-sdk-react";
import type { AssetId, ChainAddress } from "@ston-fi/omniston-sdk";

// STON.fi Omniston WebSocket endpoint (cross-chain quotes + HTLC orders).
export const OMNISTON_API_URL = "wss://omni-ws.ston.fi";

// USDT jetton on TON (master address). From PLAN.md critical constants.
export const USDT_TON_JETTON =
  "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

// Native USDC on Base — kept in sync with lib/aave.ts USDC_BASE.
import { USDC_BASE } from "./aave";

// Omniston AssetId shape is slug-based ($case discriminated union), NOT numeric
// chain_id. Confirmed against installed @ston-fi/omniston-sdk types.
export const ASSET_USDC_BASE: AssetId = {
  chain: {
    $case: "base",
    value: { kind: { $case: "erc20", value: USDC_BASE } },
  },
} as const;

export const ASSET_USDT_TON: AssetId = {
  chain: {
    $case: "ton",
    value: { kind: { $case: "jetton", value: USDT_TON_JETTON } },
  },
} as const;

// --- ChainAddress builders (the slug-based discriminated union the SDK wants) ---
export function baseChainAddress(address: string): ChainAddress {
  return { chain: { $case: "base", value: address } };
}

export function tonChainAddress(address: string): ChainAddress {
  return { chain: { $case: "ton", value: address } };
}

// hex BoC payload -> base64 for the TonConnect/Dynamic message shape. Buffer is
// provided by vite-plugin-node-polyfills.
export function hexToBase64(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64");
}

// Singleton client. The React OmnistonProvider takes this instance and exposes
// it via useOmniston(); hooks (useRfq, useOrderTrack, …) read from there.
export const omniston = new Omniston({ apiUrl: OMNISTON_API_URL });
