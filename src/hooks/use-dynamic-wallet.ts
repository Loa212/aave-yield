import { useMemo } from "react";
import {
  useDynamicContext,
  useIsLoggedIn,
  useUserWallets,
} from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { isTonWallet } from "@dynamic-labs/ton";
import type { Wallet } from "@dynamic-labs/wallet-connector-core";
import type { Address, WalletClient } from "viem";

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
  /** The raw Dynamic TON wallet (for sendTransaction()). */
  tonWallet: Wallet | undefined;
  /** Get a viem WalletClient for signing on Base. Throws if no EVM wallet. */
  getEvmWalletClient: (chainId?: string) => Promise<WalletClient>;
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
    const tonWallet = userWallets.find((w) => isTonWallet(w));

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
      signOut: handleLogOut,
    };
  }, [sdkHasLoaded, isLoggedIn, userWallets, handleLogOut]);
}
