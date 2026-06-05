import { createRouter, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { dbg, installDebugCapture } from "./lib/debug-log";
import { initTelegram } from "./lib/telegram";
import { routeTree } from "./routeTree.gen";
import "./index.css";

// TEMP DEBUG: capture errors/network from the very first tick.
installDebugCapture();

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
