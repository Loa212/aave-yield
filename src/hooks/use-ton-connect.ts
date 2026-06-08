import { openTelegramLink } from "@telegram-apps/sdk-react";
import {
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from "@tonconnect/ui-react";
import { useCallback, useMemo } from "react";

/**
 * Convert @wallet's universal link into the TonConnect CONFIRM deeplink.
 *
 * The raw universalLink `https://t.me/wallet?attach=wallet` opens @wallet's
 * SEND / "choose a contact" screen. To make @wallet check the bridge for the
 * pending TonConnect request and show the transaction CONFIRM prompt, the link
 * must be the direct-link form with `startapp=tonconnect` — exactly what the
 * SDK's own redirectToTelegram builds (convertToTGDirectLink: drop `attach`,
 * append `/start`; then add `startapp=tonconnect`).
 */
function toTonConnectConfirmLink(universalLink: string): string {
  try {
    const url = new URL(universalLink);
    if (url.searchParams.has("attach")) {
      url.searchParams.delete("attach");
      url.pathname += "/start";
    }
    if (!url.searchParams.has("startapp")) {
      url.searchParams.append("startapp", "tonconnect");
    }
    return url.toString();
  } catch {
    return universalLink;
  }
}

/**
 * Open a t.me link via Telegram's native opener (falls back to window.open).
 * Used to surface @wallet after the raw connector delivers the tx request, so
 * the user can approve it.
 */
function openTelegramLinkSafe(link: string): void {
  try {
    if (openTelegramLink.isAvailable()) {
      openTelegramLink(link);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    window.open(link, "_blank");
  } catch {
    /* ignore */
  }
}

/** A single TonConnect-shaped message (what tonBuildEscrowTransfer emits). */
export interface TonMessageInput {
  address: string;
  amount: string;
  payload?: string;
  stateInit?: string;
}

export interface TonConnectWallet {
  /** User-friendly TON address (bounceable). undefined when disconnected. */
  tonAddress: string | undefined;
  /** True once a TON wallet is connected via TonConnect. */
  isConnected: boolean;
  /** Open the connect modal targeted at Telegram's @wallet. */
  connect: () => Promise<void>;
  /** Disconnect the connected TON wallet (used by sign-out). */
  disconnect: () => Promise<void>;
  /**
   * Sign + send TonConnect messages. Returns the resulting BoC string.
   * (sendTransaction resolves to { boc } — we unwrap it.)
   */
  sendMessages: (
    messages: TonMessageInput[],
    validUntil: number,
  ) => Promise<string>;
}

/**
 * Standalone TON wallet via TonConnect — INDEPENDENT of Dynamic.
 *
 * WHY NOT Dynamic's TON connector: routing TON through Dynamic's WaaS path is
 * broken in the Telegram WebView (the WaaS credential fails to resolve
 * "missing walletName", the send UI dead-ends on a "wallets mismatched" modal,
 * and linking an external TON wallet to the Dynamic account 403s "Elevated
 * access token required"). Raw TonConnect — the same approach STON.fi's own app
 * uses — sidesteps all of it: connect the user's @wallet directly and send the
 * HTLC escrow through its native confirm UI. Dynamic still owns Telegram auth +
 * the EVM (Base) wallet for the Aave side.
 */
export function useTonConnect(): TonConnectWallet {
  const [tonConnectUI] = useTonConnectUI();
  const friendlyAddress = useTonAddress(); // bounceable user-friendly form
  const wallet = useTonWallet();

  const connect = useCallback(async () => {
    // Telegram's @wallet (TonConnect app name 'telegram-wallet') — the native
    // in-Telegram wallet for a Mini App.
    await tonConnectUI.openSingleWalletModal("telegram-wallet");
  }, [tonConnectUI]);

  const disconnect = useCallback(async () => {
    if (tonConnectUI.connected) await tonConnectUI.disconnect();
  }, [tonConnectUI]);

  const sendMessages = useCallback(
    async (messages: TonMessageInput[], validUntil: number) => {
      // WHY THE RAW CONNECTOR (not tonConnectUI.sendTransaction): inside the
      // Telegram Mini App WebView, the UI wrapper's modal/abort machinery never
      // settles, so its sendTransaction hangs. The raw connector does the bridge
      // round-trip directly. We open @wallet's CONFIRM screen ourselves in
      // onRequestSent (after the request lands on the bridge) so the user can
      // approve. The headline bug behind the long "Transaction was not sent"
      // saga was our own debug fetch wrapper crashing on URL-object args (since
      // removed) — NOT the SDK or the WebView.
      // biome-ignore lint/suspicious/noExplicitAny: connector is the raw ITonConnect
      const connector = tonConnectUI.connector as any;

      // @wallet's universal link → the TonConnect CONFIRM deeplink. The raw
      // universalLink (t.me/wallet?attach=wallet) opens the SEND/"choose a
      // contact" screen; toTonConnectConfirmLink rewrites it to the
      // startapp=tonconnect form so @wallet pulls the pending request and shows
      // the transaction confirm prompt.
      const walletUniversalLink: string | undefined =
        tonConnectUI.wallet && "universalLink" in tonConnectUI.wallet
          ? (tonConnectUI.wallet as { universalLink?: string }).universalLink
          : undefined;
      const confirmLink = walletUniversalLink
        ? toTonConnectConfirmLink(walletUniversalLink)
        : undefined;

      const result = await connector.sendTransaction(
        {
          validUntil,
          from: connector.account?.address,
          messages,
        },
        {
          onRequestSent: () => {
            if (confirmLink) openTelegramLinkSafe(confirmLink);
          },
        },
      );
      return result.boc;
    },
    [tonConnectUI],
  );

  return useMemo(
    () => ({
      tonAddress: friendlyAddress || undefined,
      isConnected: Boolean(wallet),
      connect,
      disconnect,
      sendMessages,
    }),
    [friendlyAddress, wallet, connect, disconnect, sendMessages],
  );
}
