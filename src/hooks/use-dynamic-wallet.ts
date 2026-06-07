import { isEthereumWallet } from "@dynamic-labs/ethereum";
import {
  useDynamicContext,
  useIsLoggedIn,
  useUserWallets,
} from "@dynamic-labs/sdk-react-core";
import type { Wallet } from "@dynamic-labs/wallet-connector-core";
import { useMemo } from "react";
import type { Address, WalletClient } from "viem";

// TEMP (test/sdk-3.6.2): @dynamic-labs/ton doesn't exist before 4.45.1, so for
// the 3.6.2 reference-match auth test TON is stubbed out. `TonWallet` is aliased
// to a minimal shape and the TON code paths no-op/throw. Revert when we go back
// to 4.x — this whole branch is a diagnostic for the OAuth-state 400.
type TonWallet = Wallet;

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
    // TEMP (test/sdk-3.6.2): no TON connector in 3.x — TON wallet is unavailable.
    // Typed via a helper so TS doesn't narrow the literal `undefined` to `never`.
    const tonWallet = undefined as TonWallet | undefined;

    return {
      sdkHasLoaded,
      isAuthenticated: isLoggedIn,
      evmAddress: evmWallet?.address as Address | undefined,
      tonAddress: tonWallet?.address as string | undefined,
      evmWallet,
      tonWallet,
      getEvmWalletClient: async (chainId?: string) => {
        if (!evmWallet || !isEthereumWallet(evmWallet)) {
          throw new Error("No EVM wallet available from Dynamic");
        }
        return evmWallet.getWalletClient(chainId);
      },
      sendTonMessages: async (
        _messages: TonMessageInput[],
        _validUntil: number,
      ) => {
        // TEMP (test/sdk-3.6.2): TON connector unavailable in 3.x. This path is
        // only reachable post-auth (deposit/withdraw), which we're not testing
        // on this diagnostic branch.
        throw new Error("TON wallet unavailable on the 3.6.2 test build");
      },
      signOut: handleLogOut,
    };
  }, [sdkHasLoaded, isLoggedIn, userWallets, handleLogOut]);
}
