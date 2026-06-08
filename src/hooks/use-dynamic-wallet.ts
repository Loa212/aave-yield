import { isEthereumWallet } from "@dynamic-labs/ethereum";
import {
  useDynamicContext,
  useIsLoggedIn,
  useUserWallets,
} from "@dynamic-labs/sdk-react-core";
import type { Wallet } from "@dynamic-labs/wallet-connector-core";
import { useMemo } from "react";
import type { Address, WalletClient } from "viem";
import { type TonMessageInput, useTonConnect } from "@/hooks/use-ton-connect";
import { dbg } from "@/lib/debug-log";

export type { TonMessageInput };

export interface DynamicWallet {
  /** True once Dynamic finished bootstrapping (auth state is known). */
  sdkHasLoaded: boolean;
  /** True when the user is authenticated via Telegram. */
  isAuthenticated: boolean;
  /** The user's stable EVM EOA on Base. undefined until an EVM wallet exists. */
  evmAddress: Address | undefined;
  /** The user's TON wallet address (USDT-TON side), via TonConnect. */
  tonAddress: string | undefined;
  /** The raw Dynamic EVM wallet (for getWalletClient()). */
  evmWallet: Wallet | undefined;
  /** True when a TON wallet is connected via TonConnect (deposit guard). */
  tonWallet: boolean;
  /** Alias of the above — true when the user's own TON wallet is connected. */
  hasTonConnectWallet: boolean;
  /** Open TonConnect to connect the user's TON wallet (Telegram @wallet). */
  connectTonWallet: () => Promise<void>;
  /** Get a viem WalletClient for signing on Base. Throws if no EVM wallet. */
  getEvmWalletClient: (chainId?: string) => Promise<WalletClient>;
  /**
   * Sign + send TonConnect-shaped messages via TonConnect. Returns the BoC.
   * Throws if no TON wallet is connected.
   */
  sendTonMessages: (
    messages: TonMessageInput[],
    validUntil: number,
  ) => Promise<string>;
  /** Sign out everywhere. */
  signOut: () => Promise<void> | void;
}

/**
 * Single source of truth for the user's wallets.
 *
 * SPLIT OWNERSHIP (deliberate): Dynamic owns Telegram auth + the EVM (Base) EOA
 * for the Aave side. The TON wallet is owned by RAW TonConnect (see
 * `use-ton-connect.ts`), NOT Dynamic — Dynamic's WaaS TON path is broken in the
 * Telegram WebView (resolve failure, dead-end mismatch modal, 403 on linking).
 * This hook unifies both so deposit/withdraw don't care where each comes from.
 */
export function useDynamicWallet(): DynamicWallet {
  const { sdkHasLoaded, handleLogOut } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const userWallets = useUserWallets();
  const ton = useTonConnect();

  return useMemo(() => {
    const evmWallet = userWallets.find((w) => isEthereumWallet(w));

    return {
      sdkHasLoaded,
      isAuthenticated: isLoggedIn,
      evmAddress: evmWallet?.address as Address | undefined,
      tonAddress: ton.tonAddress,
      evmWallet,
      tonWallet: ton.isConnected,
      hasTonConnectWallet: ton.isConnected,
      connectTonWallet: ton.connect,
      getEvmWalletClient: async (chainId?: string) => {
        if (!evmWallet || !isEthereumWallet(evmWallet)) {
          throw new Error("No EVM wallet available from Dynamic");
        }
        // DIAGNOSE: log the wallet's connector identity. "Unable to retrieve
        // WalletClient" + the "missing walletName" credential error suggests the
        // EVM wallet isn't a properly-provisioned embedded (turnkey) wallet.
        try {
          const w = evmWallet as unknown as {
            key?: string;
            connector?: { name?: string; key?: string };
          };
          dbg(
            "info",
            `evmWallet key=${w.key ?? "?"} connector=${w.connector?.name ?? w.connector?.key ?? "?"} chain=${chainId ?? "default"}`,
          );
        } catch {
          /* ignore */
        }
        // Dynamic's getWalletClient(chainId) returns falsy → throws "Unable to
        // retrieve WalletClient" when the embedded WaaS connector can't build a
        // client for that chain in the TMA. Make it resilient:
        //  1. Ensure the wallet is on the target chain first (switchNetwork),
        //     so the connector has the network active.
        //  2. Try with the chainId; if that yields no client, retry with no arg
        //     (uses the wallet's current/default chain).
        const numericChain = chainId ? Number(chainId) : undefined;
        if (numericChain) {
          try {
            // switchNetwork may be a method on the wallet or its connector.
            const w = evmWallet as unknown as {
              switchNetwork?: (id: number) => Promise<unknown>;
            };
            if (typeof w.switchNetwork === "function") {
              await w.switchNetwork(numericChain);
            }
          } catch {
            // Non-fatal — getWalletClient may still succeed.
          }
        }
        try {
          const client = await evmWallet.getWalletClient(chainId);
          dbg(
            "info",
            `getWalletClient(${chainId}) → ${client ? "OK" : "NULL"}`,
          );
          if (client) return client;
        } catch (e) {
          dbg("error", `getWalletClient(${chainId}) threw: ${String(e)}`);
          if (!chainId) throw e;
        }
        // Retry without the chainId (current chain).
        try {
          const fallback = await evmWallet.getWalletClient();
          dbg("info", `getWalletClient() no-arg → ${fallback ? "OK" : "NULL"}`);
          if (fallback) return fallback;
        } catch (e) {
          dbg("error", `getWalletClient() no-arg threw: ${String(e)}`);
        }
        throw new Error(
          "Unable to retrieve WalletClient for Base. The embedded wallet could not initialize a signer — reopen the app and try again.",
        );
      },
      sendTonMessages: ton.sendMessages,
      signOut: handleLogOut,
    };
  }, [sdkHasLoaded, isLoggedIn, userWallets, handleLogOut, ton]);
}
