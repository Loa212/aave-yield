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
      // DIAGNOSIS (from logs): with modals:[] the abort guard is gone, but
      // `onRequestSent` NEVER fires — the send hangs BEFORE delivery. In the SDK,
      // gateway.send() POSTs to bridge.tonapi.io with attempts=MAX_SAFE_INTEGER
      // (infinite retry, no timeout); if that POST stalls in the TMA WebView it
      // retries forever silently → onRequestSent never called → @wallet never
      // opens. So we (a) PROBE the bridge POST reachability, and (b) RESTORE the
      // connection right before sending so the gateway is fresh.

      // (a) One-shot bridge reachability probe — does the WebView's fetch reach
      // the bridge at all? GET the bridge events path; any HTTP response (even
      // 4xx) proves reachability. A network error proves the WebView is blocking
      // it (the real #340 cause for us).
      try {
        const probe = await fetch(
          "https://bridge.tonapi.io/bridge/events?client_id=probe",
          { method: "GET", signal: AbortSignal.timeout(4000) },
        );
        dbg("info", `bridge probe: HTTP ${probe.status} (reachable)`);
      } catch (e) {
        dbg(
          "error",
          `bridge probe FAILED: ${String(e)} (WebView blocking it?)`,
        );
      }

      // (b) Wait for the SDK's connection-restore to SETTLE before sending —
      // this is what the working PerpPilot reference does (await
      // connectionRestored before any wallet action). If we send while the
      // bridge gateway is still mid-restore, gateway.send queues onto a
      // not-yet-open gateway and the POST stalls.
      try {
        const restored = await tonConnectUI.connectionRestored;
        dbg("info", `connectionRestored settled: ${restored}`);
      } catch (e) {
        dbg("error", `connectionRestored failed: ${String(e)}`);
      }
      // Also force a fresh gateway in case it had paused while hidden.
      try {
        await tonConnectUI.connector?.restoreConnection?.();
        dbg("info", "bridge restoreConnection() done");
      } catch (e) {
        dbg("error", `restoreConnection failed: ${String(e)}`);
      }

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
