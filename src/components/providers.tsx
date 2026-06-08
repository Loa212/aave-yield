import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import {
  type DynamicContextProps,
  DynamicContextProvider,
} from "@dynamic-labs/sdk-react-core";
import { TonWalletConnectors } from "@dynamic-labs/ton";
import { OmnistonProvider } from "@ston-fi/omniston-sdk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  TonConnectUIProvider,
  type WalletsListConfiguration,
} from "@tonconnect/ui-react";
import type { PropsWithChildren } from "react";
import { ToastProvider } from "@/components/toast";
import { omniston } from "@/lib/omniston";

// TonConnect manifest (served from public/). The TON wallet uses raw TonConnect,
// independent of Dynamic — see src/hooks/use-ton-connect.ts for why.
const TONCONNECT_MANIFEST_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/tonconnect-manifest.json`
    : "https://aave-yield-chi.vercel.app/tonconnect-manifest.json";

// BRIDGE PROXY (the TMA send fix). Inside the iOS Telegram WebView, the direct
// POST to @wallet's bridge (walletbot.me) hangs with no response — even though
// the SSE GET to the same host returns 200 and the gateway is healthy
// (isReady=true). Routing the bridge through our OWN same-origin domain (a
// Vercel rewrite: /_tonbridge/* -> walletbot.me/tonconnect-bridge/bridge/*)
// sidesteps whatever the WebView does to that cross-origin bridge POST. We
// override @wallet's wallet-list entry so the SDK talks to the proxy. References
// (STON.fi, PerpPilot, omniston_pay) all work with a bare sendTransaction
// because they are browser dApps, NOT Mini Apps — they never hit this.
const TONBRIDGE_PROXY_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/tonbridge`
    : "https://aave-yield-chi.vercel.app/api/tonbridge";

// Full override for Telegram's @wallet (app_name "telegram-wallet", name
// "Wallet") with our proxied bridgeUrl. The SDK's mergeConcat matches by `name`
// and REPLACES the entry, so every field it needs must be present; values
// (except bridgeUrl) mirror the official wallets-list entry.
const WALLETS_LIST_CONFIG: WalletsListConfiguration = {
  includeWallets: [
    {
      appName: "telegram-wallet",
      name: "Wallet",
      imageUrl: "https://wallet.tg/images/logo-288.png",
      aboutUrl: "https://wallet.tg/",
      universalLink: "https://t.me/wallet?attach=wallet",
      bridgeUrl: TONBRIDGE_PROXY_URL,
      platforms: ["ios", "android", "macos", "windows", "linux"],
    },
  ],
};

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
// NOTE: Base (chain 8453) is configured in the Dynamic DASHBOARD (Networks), NOT
// via a settings.overrides.evmNetworks override. The in-code override was tried
// and REVERTED — it disrupted the WaaS embedded-wallet provider registration,
// causing "Failed to get wallet provider for verified credential: missing
// walletName" and hanging the AuthGate on init. The dashboard config is the
// correct, non-breaking way to add the network.
const dynamicSettings: DynamicContextProps["settings"] = {
  environmentId: DYNAMIC_ENVIRONMENT_ID,
  walletConnectors: [EthereumWalletConnectors, TonWalletConnectors],
  // Telegram social login is configured in the Dynamic dashboard; the SDK picks
  // it up automatically inside the Telegram WebView.
};

export function Providers({ children }: PropsWithChildren) {
  return (
    <DynamicContextProvider settings={dynamicSettings}>
      {/* Single TonConnect instance via manifestUrl. The bridge is kept alive
          across the @wallet sign handoff by calling unPauseConnection on the
          live connector (see use-ton-connect.ts) rather than a 2nd instance. */}
      <TonConnectUIProvider
        manifestUrl={TONCONNECT_MANIFEST_URL}
        walletsListConfiguration={WALLETS_LIST_CONFIG}
      >
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
