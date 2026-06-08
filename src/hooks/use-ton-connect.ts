import { openTelegramLink } from "@telegram-apps/sdk-react";
import {
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from "@tonconnect/ui-react";
import { useCallback, useMemo } from "react";
import { dbg } from "@/lib/debug-log";

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
      // Probe the PROXY POST (the operation that hangs direct). GET already
      // works direct; the POST to /message is what stalls in the WebView. Test
      // the same-origin proxy POST — if it returns fast, the proxy fixes it.
      const proxyBase = `${window.location.origin}/api/tonbridge`;
      try {
        const t = Date.now();
        const probe = await fetch(
          `${proxyBase}/message?client_id=probe&to=probe&ttl=300&topic=sendTransaction`,
          { method: "POST", body: "probe", signal: AbortSignal.timeout(6000) },
        );
        dbg(
          "info",
          `proxy POST: HTTP ${probe.status} in ${Date.now() - t}ms (proxy works!)`,
        );
      } catch (e) {
        dbg("error", `proxy POST FAILED: ${String(e)}`);
      }
      // And the direct POST for comparison (expect: hangs/times out in WebView).
      try {
        const t = Date.now();
        const probe = await fetch(
          "https://walletbot.me/tonconnect-bridge/bridge/message?client_id=probe&to=probe&ttl=300&topic=sendTransaction",
          { method: "POST", body: "probe", signal: AbortSignal.timeout(6000) },
        );
        dbg("info", `direct POST: HTTP ${probe.status} in ${Date.now() - t}ms`);
      } catch (e) {
        dbg("error", `direct POST FAILED: ${String(e)}`);
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
      // NOTE: removed the redundant restoreConnection() — connectionRestored
      // already settled and gateway.isReady=true. restoreConnection() swaps the
      // provider/gateway, which may transiently null the session the send needs.

      // Log gateway readiness + that we're about to call sendTransaction (the
      // previous run went silent right here — no POST, no onRequestSent — so we
      // pin whether the call even starts and whether it reaches the bridge POST).
      try {
        // biome-ignore lint/suspicious/noExplicitAny: reading private SDK state
        const gw = (tonConnectUI.connector as any)?.provider?.gateway;
        dbg(
          "info",
          `gateway isReady=${gw?.isReady} acct=${tonConnectUI.account?.address?.slice(0, 8)} → calling sendTransaction`,
        );
      } catch {
        /* ignore */
      }

      // THE FIX: tonConnectUI.sendTransaction hangs for 30s INSIDE the UI wrapper
      // — before any bridge POST — even with the bridge healthy (isReady=true).
      // The widget/modal machinery never settles in this TMA WebView. So bypass
      // it: call the RAW connector.sendTransaction, which does the bridge POST
      // directly with NO modal/widget/abort layer. We open @wallet ourselves in
      // onRequestSent via the wallet's universal link.
      // biome-ignore lint/suspicious/noExplicitAny: raw connector + private link
      const connector = tonConnectUI.connector as any;
      // @wallet's universal link (for the redirect to its confirm screen).
      const walletUniversalLink: string | undefined =
        tonConnectUI.wallet && "universalLink" in tonConnectUI.wallet
          ? (tonConnectUI.wallet as { universalLink?: string }).universalLink
          : undefined;

      // The CONFIRM deeplink: t.me/wallet?attach=wallet (the raw universalLink)
      // opens @wallet's SEND/"choose a contact" screen — WRONG. To make @wallet
      // pull the pending TonConnect request off the bridge and show the CONFIRM
      // prompt, we must open the direct-link form with startapp=tonconnect (this
      // mirrors the SDK's own redirectToTelegram). We open it AFTER the POST has
      // landed (in onRequestSent) so the request is already on the bridge.
      const confirmLink = walletUniversalLink
        ? toTonConnectConfirmLink(walletUniversalLink)
        : undefined;

      try {
        dbg("info", "calling RAW connector.sendTransaction");
        const sendP = connector.sendTransaction(
          {
            validUntil,
            from: connector.account?.address,
            messages,
          },
          {
            onRequestSent: () => {
              dbg("info", "raw onRequestSent (POST landed) → open @wallet");
              if (confirmLink) openTelegramLinkSafe(confirmLink);
            },
          },
        );
        const timeoutP = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("RAW_SEND_TIMEOUT_40s")), 40_000),
        );
        const result = (await Promise.race([sendP, timeoutP])) as {
          boc: string;
        };
        dbg("info", `RAW send OK: boc=${result.boc?.slice(0, 16)}…`);
        return result.boc;
      } catch (e) {
        dbg("error", `RAW send failed: ${String(e)}`);
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
