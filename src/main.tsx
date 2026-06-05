import { createRouter, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { initTelegram } from "./lib/telegram";
import { routeTree } from "./routeTree.gen";
import "./index.css";

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
void initTelegram().finally(() => {
  root.render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
});
