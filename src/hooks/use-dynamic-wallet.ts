import { isEthereumWallet } from "@dynamic-labs/ethereum";
import {
  useDynamicContext,
  useIsLoggedIn,
  useUserWallets,
} from "@dynamic-labs/sdk-react-core";
import type { TonWallet, TonWalletConnector } from "@dynamic-labs/ton";
import { isTonWallet } from "@dynamic-labs/ton";
import type { Wallet } from "@dynamic-labs/wallet-connector-core";
import { useMemo } from "react";
import type { Address, WalletClient } from "viem";

/** A single TonConnect-shaped message (what tonBuildEscrowTransfer emits). */
export interface TonMessageInput {
  address: string;
  amount: string;
  payload?: string;
  stateInit?: string;
}

export interface DynamicWallet {
  /** True once Dynamic finished bootstrapping (auth state is known). */
  sdkHasLoaded: boolean;
  /** True when the user is authenticated via Telegram. */
  isAuthenticated: boolean;
  /** The user's stable EVM EOA on Base. undefined until an EVM wallet exists. */
  evmAddress: Address | undefined;
  /** The user's TON wallet address (USDT-TON side). */
  tonAddress: string | undefined;
  /** The raw Dynamic EVM wallet (for getWalletClient()). */
  evmWallet: Wallet | undefined;
  /** The raw Dynamic TON wallet (for sending escrow transfers). */
  tonWallet: TonWallet | undefined;
  /** Get a viem WalletClient for signing on Base. Throws if no EVM wallet. */
  getEvmWalletClient: (chainId?: string) => Promise<WalletClient>;
  /**
   * Sign + send TonConnect-shaped messages via Dynamic's TON connector.
   * Returns the resulting BoC. Throws if no TON wallet.
   */
  sendTonMessages: (
    messages: TonMessageInput[],
    validUntil: number,
  ) => Promise<string>;
  /** Sign out everywhere. */
  signOut: () => Promise<void> | void;
}

/**
 * Single source of truth for the user's Dynamic-managed wallets.
 *
 * Dynamic provisions BOTH an EVM EOA (Aave side) and a TON wallet (USDT-TON
 * side) from one Telegram login — that dual-wallet identity is the spine of the
 * bridge. We surface both here so deposit/withdraw hooks don't each re-derive
 * the wallet lookup.
 */
export function useDynamicWallet(): DynamicWallet {
  const { sdkHasLoaded, handleLogOut } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const userWallets = useUserWallets();

  return useMemo(() => {
    const evmWallet = userWallets.find((w) => isEthereumWallet(w));
    const tonWallet = userWallets.find((w): w is TonWallet => isTonWallet(w));

    return {
      sdkHasLoaded,
      isAuthenticated: isLoggedIn,
      evmAddress: evmWallet?.address as Address | undefined,
      tonAddress: tonWallet?.address,
      evmWallet,
      tonWallet,
      getEvmWalletClient: async (chainId?: string) => {
        if (!evmWallet || !isEthereumWallet(evmWallet)) {
          throw new Error("No EVM wallet available from Dynamic");
        }
        return evmWallet.getWalletClient(chainId);
      },
      sendTonMessages: async (
        messages: TonMessageInput[],
        validUntil: number,
      ) => {
        if (!tonWallet) throw new Error("No TON wallet available from Dynamic");
        // The base Wallet.connector getter widens to WalletConnector; for a
        // TonWallet it's concretely a TonWalletConnector, which exposes
        // sendTransaction(SendTransactionRequest). Narrow it back here.
        const connector = tonWallet.connector as unknown as TonWalletConnector;
        return connector.sendTransaction({
          from: tonWallet.address,
          validUntil,
          messages,
        });
      },
      signOut: handleLogOut,
    };
  }, [sdkHasLoaded, isLoggedIn, userWallets, handleLogOut]);
}
