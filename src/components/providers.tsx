import { type PropsWithChildren } from "react";
import {
  DynamicContextProvider,
  type DynamicContextProps,
} from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { TonWalletConnectors } from "@dynamic-labs/ton";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OmnistonProvider } from "@ston-fi/omniston-sdk-react";
import { omniston } from "@/lib/omniston";
import { ToastProvider } from "@/components/toast";

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

// ASSUMPTION: We enable BOTH Ethereum and TON connectors so Dynamic provisions
// a stable EVM EOA (Aave side) AND a TON wallet (USDT-TON side) from the single
// Telegram social login. This is the spine of the whole bridge architecture.
const dynamicSettings: DynamicContextProps["settings"] = {
  environmentId: DYNAMIC_ENVIRONMENT_ID,
  walletConnectors: [EthereumWalletConnectors, TonWalletConnectors],
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
