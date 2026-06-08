import { setupInsideIframe } from "@dynamic-labs/utils";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { initTelegram } from "./lib/telegram";
import { routeTree } from "./routeTree.gen";
import "./index.css";

// Dynamic iframe setup — the fix for the "Invalid or expired OAuth state" 400.
//
// Inside the Telegram WebView, the page origin Dynamic sees is not a stable,
// trusted origin, so the OAuth-state / session it establishes can't be validated
// against the origin at signin time → 400. `setupInsideIframe()` overrides
// Dynamic's PlatformService so getOrigin()/getHost() return a FIXED parent URL
// we supply via the `initial-parent-url` query param (verified by reading the
// installed @dynamic-labs/utils source: getInitialParentURL() throws without it).
// Cribbed from a working production TMA (manudev97/first-frame) — written fresh.
//
// MUST run before React mounts (and before Dynamic's module reads the URL), so
// we set the param synchronously here, guarded to add it only once.
if (typeof window !== "undefined" && window.Telegram?.WebApp) {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has("initial-parent-url")) {
      // Base origin+path only (no query/hash) — a stable, self-referential
      // parent URL. setupInsideIframe decodeURIComponent()s this value.
      const parent = window.location.origin + window.location.pathname;
      u.searchParams.set("initial-parent-url", encodeURIComponent(parent));
      window.history.replaceState(null, "", u.toString());
    }
    setupInsideIframe();
  } catch {
    // Non-fatal — the app must still load.
  }
}

// IMPORTANT: strip ?telegramAuthToken from the URL BEFORE Dynamic's module
// captures window.location.href. When the token is present, Dynamic auto-runs
// its telegram link-check at init and (on iOS Safari, with the #tgWebAppData
// hash also present) throws an uncaught "SyntaxError: string did not match the
// expected pattern" that crashes init (sdkHasLoaded stuck false). We
// authenticate explicitly via initData-mint instead, so we don't need the token
// in the URL — remove it to keep Dynamic's init clean.
try {
  const u = new URL(window.location.href);
  if (u.searchParams.has("telegramAuthToken")) {
    u.searchParams.delete("telegramAuthToken");
    window.history.replaceState(null, "", u.pathname + u.search + u.hash);
  }
} catch {
  /* ignore */
}

// HTML5 history (default) — NOT hash mode. Hash routing clobbers the
// #tgWebAppData launch-param hash that Telegram delivers, breaking init-data.
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootEl);

// Await TG init before first render (Storage-Unavailable fix). On failure we
// still render — the app degrades to "open in Telegram" UX rather than hanging.
void initTelegram()
  .catch(() => {
    // Non-fatal — render anyway; app degrades to "open in Telegram" UX.
  })
  .finally(() => {
    root.render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>,
    );
  });
