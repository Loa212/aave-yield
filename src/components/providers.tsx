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

// Base (chain 8453) network override.
//
// WHY: our Dynamic environment has NO EVM networks configured server-side, so the
// WaaS EVM wallet throws "EVM network not found" the moment we read/supply USDC on
// Base (verified: /settings networks is empty, no 8453). Rather than fight the
// dashboard, we register Base in-code via settings.overrides.evmNetworks — the
// same approach Dynamic's working reference app uses. This makes the embedded EVM
// wallet operate on Base without any dashboard change.
const BASE_NETWORK = {
  blockExplorerUrls: ["https://basescan.org"],
  chainId: 8453,
  chainName: "Base",
  iconUrls: ["https://app.dynamic.xyz/assets/networks/base.svg"],
  name: "Base",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  networkId: 8453,
  rpcUrls: ["https://mainnet.base.org"],
  vanityName: "Base",
};

// We enable BOTH Ethereum and TON connectors so Dynamic provisions a stable EVM
// EOA (Aave side) AND a TON wallet (USDT-TON side) from the single Telegram login.
const dynamicSettings: DynamicContextProps["settings"] = {
  environmentId: DYNAMIC_ENVIRONMENT_ID,
  walletConnectors: [EthereumWalletConnectors, TonWalletConnectors],
  // Register Base so the embedded EVM wallet has a network to operate on.
  overrides: { evmNetworks: [BASE_NETWORK] },
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
