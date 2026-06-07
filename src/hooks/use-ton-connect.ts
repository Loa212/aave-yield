import {
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from "@tonconnect/ui-react";
import { useCallback, useMemo } from "react";
import { dbg } from "@/lib/debug-log";

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
    // Jump straight to Telegram's @wallet (TonConnect app name 'telegram-wallet').
    await tonConnectUI.openSingleWalletModal("telegram-wallet");
  }, [tonConnectUI]);

  const sendMessages = useCallback(
    async (messages: TonMessageInput[], validUntil: number) => {
      dbg(
        "info",
        `tonconnect send: ${messages.length} msg(s), validUntil=${validUntil}, to=${messages[0]?.address?.slice(0, 12)}…`,
      );
      // ROBUST TMA PATH: call the RAW SDK connector, not tonConnectUI.
      // The UI wrapper's sendTransaction has two TMA bugs (verified in
      // @tonconnect/ui source): (a) it aborts when its 'before' modal closes on
      // the WebView handoff → "Transaction was not sent"; (b) its auto-redirect
      // to @wallet only fires for resolved universal-link wallets, else it spins
      // forever with no way to open the sign sheet. The raw connector has
      // neither coupling — it just sends over the bridge and resolves. We open
      // @wallet ourselves so the user can approve.
      const connector = tonConnectUI.connector;

      // Surface @wallet so the user can sign. Telegram's @wallet is a t.me
      // universal-link wallet; opening it via the Telegram WebApp API brings up
      // its sign sheet for the pending bridge request.
      const openWallet = () => {
        try {
          const link = (
            tonConnectUI.wallet as unknown as { universalLink?: string } | null
          )?.universalLink;
          const tg = window.Telegram?.WebApp as
            | { openTelegramLink?: (u: string) => void }
            | undefined;
          if (link && tg?.openTelegramLink) {
            tg.openTelegramLink(link);
            dbg("info", `opened @wallet via ${link.slice(0, 24)}…`);
          } else {
            dbg("error", `no universalLink/openTelegramLink (link=${!!link})`);
          }
        } catch (e) {
          dbg("error", `openWallet failed: ${String(e)}`);
        }
      };

      try {
        // sendTransaction(tx, { onRequestSent }) — onRequestSent fires once the
        // request is delivered to the bridge; that's when we open @wallet.
        const result = await connector.sendTransaction(
          { validUntil, messages },
          { onRequestSent: openWallet },
        );
        dbg("info", `tonconnect send OK: boc=${result.boc?.slice(0, 16)}…`);
        return result.boc;
      } catch (e) {
        dbg("error", `tonconnect send failed: ${String(e)}`);
        throw e;
      }
    },
    [tonConnectUI],
  );

  return useMemo(
    () => ({
      tonAddress: friendlyAddress || undefined,
      isConnected: Boolean(wallet),
      connect,
      sendMessages,
    }),
    [friendlyAddress, wallet, connect, sendMessages],
  );
}
