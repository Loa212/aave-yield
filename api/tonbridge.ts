/**
 * TonConnect bridge proxy (the Telegram-Mini-App send fix).
 *
 * WHY THIS EXISTS: inside the iOS Telegram WebView, the TonConnect SDK's POST to
 * @wallet's bridge (`walletbot.me/tonconnect-bridge/bridge/message`) HANGS with
 * no response — even though the SSE `GET /events` to the same host returns 200,
 * the gateway reports `isReady=true`, and the very same POST succeeds from curl
 * and from every non-TMA browser. The WebView mangles that specific cross-origin
 * bridge POST, so the signed-transaction request never reaches @wallet and the
 * deposit can't be signed. (All the reference apps — STON.fi, PerpPilot,
 * omniston_pay — work with a bare sendTransaction only because they run as
 * regular browser dApps, never inside the Telegram WebView.)
 *
 * THE FIX: route the bridge through our OWN origin. The app talks to
 * `https://<app>/api/tonbridge/...` (same-origin → the WebView treats it as a
 * normal first-party request), and this Edge function forwards to walletbot.me
 * server-side. @wallet's wallet-list `bridgeUrl` is overridden to this path in
 * src/components/providers.tsx.
 *
 * Edge runtime (not Node serverless): the bridge's `/events` endpoint is a
 * long-lived Server-Sent-Events stream. Edge functions stream a Response body
 * without the serverless buffering/duration limits, so we can pipe the SSE
 * through transparently.
 */

export const config = { runtime: "edge" };

const UPSTREAM = "https://walletbot.me/tonconnect-bridge/bridge";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Strip our proxy prefix; forward the remainder (e.g. "/events", "/message")
  // plus the original query string to the real bridge.
  const subPath = url.pathname.replace(/^\/api\/tonbridge/, "");
  const upstreamUrl = `${UPSTREAM}${subPath}${url.search}`;

  // CORS preflight — answer locally (same-origin in prod, but be permissive).
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Forward the request to the upstream bridge, preserving method + body.
  const upstreamReq: RequestInit = {
    method: req.method,
    headers: {
      // Only forward content-type; let fetch set the rest. Forwarding the
      // WebView's headers verbatim can trigger the same upstream quirks.
      "content-type": req.headers.get("content-type") ?? "application/json",
      accept: req.headers.get("accept") ?? "*/*",
    },
    // GET/HEAD must not carry a body.
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.text(),
  };

  const upstreamRes = await fetch(upstreamUrl, upstreamReq);

  // Stream the response body straight through (SSE for /events, JSON for
  // /message). Copy through the content-type so EventSource recognizes the
  // text/event-stream, and add permissive CORS.
  const headers = new Headers(corsHeaders());
  const ct = upstreamRes.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const cc = upstreamRes.headers.get("cache-control");
  if (cc) headers.set("cache-control", cc);

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept",
  };
}
