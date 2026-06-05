import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import {
  type DynamicContextProps,
  DynamicContextProvider,
} from "@dynamic-labs/sdk-react-core";
import { TonWalletConnectors } from "@dynamic-labs/ton";
import { OmnistonProvider } from "@ston-fi/omniston-sdk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { ToastProvider } from "@/components/toast";
import { omniston } from "@/lib/omniston";

// Dynamic environment ID. Set VITE_DYNAMIC_ENVIRONMENT_ID in Vercel / .env.local.
// Without it, Dynamic renders an error widget rather than crashing the app.
const DYNAMIC_ENVIRONMENT_ID =
  import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID ?? "";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Market data is fine slightly stale; refetch on focus keeps APYs fresh.
      staleTime: 30_000,
      retry: 2,
    },
  },
});

// We enable BOTH Ethereum and TON connectors so Dynamic provisions a stable EVM
// EOA (Aave side) AND a TON wallet (USDT-TON side) from the single Telegram login.
//
// TEMP DEBUG: VITE_DISABLE_TON=1 drops the TON connector to match Dynamic's
// known-working reference repo (EVM + Solana, no TON). We're testing whether the
// TON connector's init is what breaks Telegram sign-in (the 400 "Invalid OAuth
// state"). If EVM-only signs in cleanly, TON is the culprit and we re-add it via
// a different path (TON Connect, or lazy after auth).
// TEMP: defaulting to true for the EVM-only A/B test (no Vercel env needed).
// Flip back to `=== "1"` once we know whether TON is the auth blocker.
const DISABLE_TON = import.meta.env.VITE_DISABLE_TON !== "0";

const dynamicSettings: DynamicContextProps["settings"] = {
  environmentId: DYNAMIC_ENVIRONMENT_ID,
  walletConnectors: DISABLE_TON
    ? [EthereumWalletConnectors]
    : [EthereumWalletConnectors, TonWalletConnectors],
  // Telegram social login is configured in the Dynamic dashboard; the SDK picks
  // it up automatically inside the Telegram WebView.
};

export function Providers({ children }: PropsWithChildren) {
  return (
    <DynamicContextProvider settings={dynamicSettings}>
      <QueryClientProvider client={queryClient}>
        {/* NOTE: We intentionally do NOT pass our queryClient to OmnistonProvider.
            The SDK pins @tanstack/react-query@5.96.0 as a hard dep (not a peer),
            so bun keeps a nested copy whose QueryClient type is nominally
            distinct from ours. Letting OmnistonProvider spin up its own internal
            client for its observable RFQ/order queries avoids the type clash and
            costs nothing — the two client instances don't need to be shared. */}
        <OmnistonProvider omniston={omniston}>
          <ToastProvider>{children}</ToastProvider>
        </OmnistonProvider>
      </QueryClientProvider>
    </DynamicContextProvider>
  );
}
