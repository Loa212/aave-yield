import { createRouter, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { dbg, installDebugCapture } from "./lib/debug-log";
import { initTelegram } from "./lib/telegram";
import { routeTree } from "./routeTree.gen";
import "./index.css";

// TEMP DEBUG: capture errors/network from the very first tick.
installDebugCapture();

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
    dbg("info", "stripped telegramAuthToken from URL pre-init");
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
dbg("info", "initTelegram() start");
void initTelegram()
  .then(() => dbg("info", "initTelegram() resolved"))
  .catch((e) => dbg("error", `initTelegram() threw: ${String(e)}`))
  .finally(() => {
    dbg("info", "rendering React");
    root.render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>,
    );
  });
