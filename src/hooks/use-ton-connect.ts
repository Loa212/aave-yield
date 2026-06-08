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
    // Telegram's @wallet (TonConnect app name 'telegram-wallet') — the native
    // in-Telegram wallet for a Mini App.
    await tonConnectUI.openSingleWalletModal("telegram-wallet");
  }, [tonConnectUI]);

  const sendMessages = useCallback(
    async (messages: TonMessageInput[], validUntil: number) => {
      const m0 = messages[0];
      dbg(
        "info",
        `tonconnect send: ${messages.length} msg(s) vu=${validUntil} from=${tonConnectUI.account?.address?.slice(0, 10)}`,
      );
      dbg(
        "info",
        `msg0: to=${m0?.address?.slice(0, 14)} amt=${m0?.amount} payloadLen=${m0?.payload?.length ?? 0} stateInit=${m0?.stateInit ? "yes" : "no"}`,
      );
      // THE #340 FIX — `modals: []`.
      //
      // tonConnectUI.sendTransaction wraps the real bridge call in an
      // abort-on-modal-close guard (verified in @tonconnect/ui source):
      //
      //   onTransactionModalStateChange((action) => {
      //     if (action?.openModal) return;
      //     unsubscribe();
      //     if (!action) abortController.abort();  // -> "Transaction was not sent"
      //   })
      //   ... waitForSendTransaction({ signal: abortController.signal })
      //
      // In a Mini App, opening @wallet to sign DISMISSES our "before" modal →
      // the modal's onClose fires setAction(null) → the guard aborts the bridge
      // wait BEFORE @wallet's signed response comes back. The send itself was
      // never really cancelled; only our wait was killed. That is SDK bug #340.
      //
      // With `modals: []` the SDK never opens its modal: the first state change
      // carries `{ openModal: false }` (a non-null action), so the guard
      // unsubscribes WITHOUT aborting and is disarmed for the rest of the tx —
      // any later setAction(null) is ignored. The bridge wait then runs to
      // completion and receives @wallet's signature.
      //
      // BUT suppressing the modal also suppresses the modal-driven open, so we
      // must open @wallet OURSELVES. The SDK hands us its OWN fully-correct
      // redirect fn as the arg to onRequestSent (enriched with sessionId +
      // traceId, proper t.me/startapp=tonconnect&ret=back link). We call it so
      // @wallet opens on the CONFIRM screen — without re-arming the abort guard.
      // (Verified the first attempt with modals:[] alone hung after
      // "tonconnect send: 1 msg" with no open — because nothing redirected.)
      try {
        const result = await tonConnectUI.sendTransaction(
          {
            validUntil,
            from: tonConnectUI.account?.address,
            messages,
          },
          {
            modals: [],
            notifications: [],
            onRequestSent: (redirectToWallet) => {
              dbg("info", "onRequestSent → opening @wallet");
              redirectToWallet();
            },
          },
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
