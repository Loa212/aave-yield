import { isEthereumWallet } from "@dynamic-labs/ethereum";
import {
  useDynamicContext,
  useIsLoggedIn,
  useUserWallets,
  useWalletOptions,
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
  /**
   * True when the active TON wallet is a real TON Connect wallet (the user's
   * own funded wallet) rather than the Dynamic WaaS provisioned one. Deposits
   * need this — the WaaS send path is broken in the Telegram WebView.
   */
  hasTonConnectWallet: boolean;
  /** Open TON Connect to link the user's own TON wallet (e.g. Telegram @wallet). */
  connectTonWallet: () => Promise<void>;
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
  const { selectWalletOption } = useWalletOptions();

  return useMemo(() => {
    const evmWallet = userWallets.find((w) => isEthereumWallet(w));

    // TON wallet selection: prefer a real TON Connect wallet (the user's funded
    // @wallet) over the Dynamic WaaS provisioned one. The WaaS TON send path is
    // BROKEN in the Telegram WebView (a "wallets are mismatched" modal dead-ends
    // — see memory), whereas TON Connect routes through the wallet's own working
    // UI. WaasTonWallet adds no fields over TonWallet, so we discriminate on the
    // connector: the WaaS connector has isEmbeddedWallet===true / key
    // 'dynamicwaas'; TON Connect connectors are isEmbeddedWallet===false.
    const tonWallets = userWallets.filter((w): w is TonWallet =>
      isTonWallet(w),
    );
    const isWaasTon = (w: TonWallet): boolean => {
      const c = w.connector as unknown as {
        isEmbeddedWallet?: boolean;
        key?: string;
      };
      return c.isEmbeddedWallet === true || c.key === "dynamicwaas";
    };
    const tonConnectWallet = tonWallets.find((w) => !isWaasTon(w));
    const tonWallet = tonConnectWallet ?? tonWallets[0];

    return {
      sdkHasLoaded,
      isAuthenticated: isLoggedIn,
      evmAddress: evmWallet?.address as Address | undefined,
      tonAddress: tonWallet?.address,
      evmWallet,
      tonWallet,
      hasTonConnectWallet: Boolean(tonConnectWallet),
      // Open TON Connect for Telegram's @wallet (wallet-book key
      // 'telegramwallet'). skipAllSelectionUi=true bypasses Dynamic's picker and
      // opens the wallet's own TonConnect modal directly. Once connected, the
      // new wallet appears in userWallets and the preference logic above selects
      // it for deposits.
      connectTonWallet: async () => {
        await selectWalletOption("telegramwallet", false, true);
      },
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
        const connector =
          tonWallet.connector as unknown as TonWalletConnector & {
            validateActiveWallet?: (address: string) => Promise<void>;
          };
        // CRITICAL: set the connector's active account before sending. Both the
        // WaaS and TON Connect connectors throw "Active account address is
        // required" from sendTransaction() if it isn't set; their higher-level
        // sendBalance() calls validateActiveWallet() first, but we send raw HTLC
        // escrow messages, so we must do it ourselves. (Verified against the
        // installed @dynamic-labs/ton connector source.)
        await connector.validateActiveWallet?.(tonWallet.address);
        return connector.sendTransaction({
          from: tonWallet.address,
          validUntil,
          messages,
        });
      },
      signOut: handleLogOut,
    };
  }, [sdkHasLoaded, isLoggedIn, userWallets, handleLogOut, selectWalletOption]);
}
