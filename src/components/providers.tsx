import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import {
  type DynamicContextProps,
  DynamicContextProvider,
} from "@dynamic-labs/sdk-react-core";
import { TonWalletConnectors } from "@dynamic-labs/ton";
import { DynamicWaasEVMConnectors } from "@dynamic-labs/waas-evm";
import { OmnistonProvider } from "@ston-fi/omniston-sdk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import type { PropsWithChildren } from "react";
import { ToastProvider } from "@/components/toast";
import { omniston } from "@/lib/omniston";

// TonConnect manifest (served from public/). The TON wallet uses raw TonConnect,
// independent of Dynamic — see src/hooks/use-ton-connect.ts for why.
const TONCONNECT_MANIFEST_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/tonconnect-manifest.json`
    : "https://aave-yield-chi.vercel.app/tonconnect-manifest.json";

// NOTE: We do NOT override @wallet's wallet-list entry. An earlier attempt
// passed a custom entry with a flat `bridgeUrl` to route through a same-origin
// proxy — but the SDK resolves a remote wallet's bridge from a `bridge: [{type:
// 'sse', url}]` array (see getWallets in @tonconnect/sdk), so the flat field
// left the gateway with an UNDEFINED bridgeUrl → addPathToUrl(undefined,...) →
// "TypeError: n.slice" thrown on every bridge POST, retried every 5s forever
// (the 40s send hang). The proxy was also unnecessary: the direct POST to
// walletbot.me returns in ~100ms from the WebView. We let the SDK use @wallet's
// stock bridge entry untouched.

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

// Connectors. DynamicWaasEVMConnectors is REQUIRED to provision a real
// signing embedded (Turnkey-backed) EVM wallet. Without it, Dynamic created a
// "Fallback Connector" shell with an address but NO signer — every
// getWalletClient() threw "Unable to retrieve WalletClient" (and the
// "Failed to get wallet provider...missing walletName" error fired on load),
// so the Aave supply tx could never be signed even though the bridge delivered
// USDC to Base. EthereumWalletConnectors stays for external EVM wallets;
// TonWalletConnectors stays for Telegram social login (the TON SIGNING itself
// is handled by raw TonConnect — see use-ton-connect.ts).
//
// NOTE: Base (chain 8453) is configured in the Dynamic DASHBOARD (Networks), NOT
// via a settings.overrides.evmNetworks override (that override broke auth — see
// git history).
const dynamicSettings: DynamicContextProps["settings"] = {
  environmentId: DYNAMIC_ENVIRONMENT_ID,
  walletConnectors: [
    DynamicWaasEVMConnectors,
    EthereumWalletConnectors,
    TonWalletConnectors,
  ],
  // Telegram social login is configured in the Dynamic dashboard; the SDK picks
  // it up automatically inside the Telegram WebView.
};

export function Providers({ children }: PropsWithChildren) {
  return (
    <DynamicContextProvider settings={dynamicSettings}>
      {/* Single TonConnect instance via manifestUrl. The bridge is kept alive
          across the @wallet sign handoff by calling unPauseConnection on the
          live connector (see use-ton-connect.ts) rather than a 2nd instance. */}
      <TonConnectUIProvider manifestUrl={TONCONNECT_MANIFEST_URL}>
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
      </TonConnectUIProvider>
    </DynamicContextProvider>
  );
}
