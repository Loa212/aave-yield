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

      // Log the ACTUAL bridge URL the connected session is using — earlier the
      // probe tested the wrong host (bridge.tonapi.io, which the ISP blocks),
      // but @wallet's real bridge is walletbot.me. Surface the real one.
      try {
        // biome-ignore lint/suspicious/noExplicitAny: reading private SDK state for diagnosis
        const provider = (tonConnectUI.connector as any)?.provider;
        const sessionBridge = provider?.session?.bridgeUrl;
        const srcBridge = provider?.walletConnectionSource?.bridgeUrl;
        dbg(
          "info",
          `session bridge=${sessionBridge ?? "?"} src=${srcBridge ?? "?"}`,
        );
      } catch (e) {
        dbg("error", `bridge introspect failed: ${String(e)}`);
      }
      // Probe BOTH candidate bridges so we know which is reachable here.
      for (const host of [
        "https://walletbot.me/tonconnect-bridge/bridge",
        "https://bridge.tonapi.io/bridge",
      ]) {
        try {
          const probe = await fetch(`${host}/events?client_id=probe`, {
            method: "GET",
            signal: AbortSignal.timeout(4000),
          });
          dbg("info", `probe ${host}: HTTP ${probe.status} OK`);
        } catch (e) {
          dbg("error", `probe ${host} FAILED: ${String(e)}`);
        }
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

      // Log whether the SSE gateway is actually OPEN (reachable via fetch != SSE
      // EventSource open in the iOS WebView). If it's not ready, the send POST
      // succeeds but the SIGNED RESPONSE can't be delivered back over the SSE.
      try {
        // biome-ignore lint/suspicious/noExplicitAny: reading private SDK state
        const gw = (tonConnectUI.connector as any)?.provider?.gateway;
        dbg(
          "info",
          `gateway isReady=${gw?.isReady} isConnecting=${gw?.isConnecting} isClosed=${gw?.isClosed}`,
        );
      } catch {
        /* ignore */
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
