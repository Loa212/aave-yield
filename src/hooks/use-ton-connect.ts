import {
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from "@tonconnect/ui-react";
import { useCallback, useEffect, useMemo } from "react";
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

  // THE TMA FIX: the TonConnect SDK pauses the bridge SSE connection when the
  // tab is hidden. In a Mini App, opening @wallet to sign hides our WebView →
  // the bridge pauses → @wallet's SIGNED response can't be delivered back →
  // "Transaction was not sent". Re-open the bridge whenever we regain focus so
  // the pending signed response is received. (We call unPauseConnection on the
  // LIVE connector the hook uses — not a second instance.)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void tonConnectUI.connector
          ?.unPauseConnection?.()
          .then(() => dbg("info", "ton bridge unpaused (visible)"))
          .catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [tonConnectUI]);

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
      // EXACT match to STON.fi Omniston's reference example (same SDK 2.4.4,
      // same escrow): bare sendTransaction with NO options object, and pass
      // `from` explicitly. Adding modals/returnStrategy/twaReturnUrl options was
      // triggering the TMA abort; the defaults work.
      try {
        // Ensure the bridge is live before sending (it may have paused).
        await tonConnectUI.connector
          ?.unPauseConnection?.()
          .catch(() => undefined);
        const result = await tonConnectUI.sendTransaction({
          validUntil,
          from: tonConnectUI.account?.address,
          messages,
        });
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
