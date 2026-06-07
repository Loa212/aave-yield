import {
  backButton,
  hapticFeedback,
  init,
  initData,
  miniApp,
  themeParams,
  viewport,
} from "@telegram-apps/sdk-react";

let initialized = false;

/**
 * Mount a TG component that Dynamic's SDK might already be mounting. Guards on
 * isMounted() and swallows the `ConcurrentCallError` ("already mounting") that
 * fires when Dynamic's embedded @telegram-apps/sdk mounts the same component
 * concurrently — that unhandled rejection was crashing Dynamic's init.
 *
 * mount() returns an AbortablePromise that can REJECT (not just throw sync), so
 * we attach a .catch on the returned value too.
 */
function safeMount(component: {
  isMounted: () => boolean;
  mount: () => unknown;
}) {
  if (component.isMounted()) return;
  try {
    const maybePromise = component.mount();
    if (
      maybePromise &&
      typeof (maybePromise as { catch?: unknown }).catch === "function"
    ) {
      (maybePromise as Promise<unknown>).catch(() => {
        // ConcurrentCallError — Dynamic owns the mount, ignore.
      });
    }
  } catch {
    // sync throw variant — ignore.
  }
}

/**
 * Initialize the Telegram Mini App SDK.
 *
 * IMPORTANT (Polygram lesson): call this and AWAIT it before rendering React.
 * Mounting React components that touch the TG bridge before the SDK finished
 * wiring is what caused the "Storage Unavailable" hang on iOS Telegram.
 *
 * We do NOT call miniApp.ready() early — Telegram auto-reveals the app, and an
 * early ready() can drop bridge state on iOS. We use HTML5 history routing
 * (TanStack Router default) so we never clobber the launch-param hash.
 */
export async function initTelegram(): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  try {
    init();
    initData.restore();

    backButton.mount.ifAvailable();

    // IMPORTANT: Dynamic's SDK (esp. @dynamic-labs/ton on 4.x) embeds
    // @telegram-apps/sdk and ALSO mounts themeParams / miniApp / viewport.
    // Mounting them a second time throws `ConcurrentCallError: ... already
    // mounting`, whose unhandled rejection killed Dynamic's init (sdkHasLoaded
    // stuck false in the TG WebView). Guard every mount on isMounted() so we
    // coexist regardless of who runs first, and only bind CSS vars once mounted.
    // (Kept on the 3.6.2 test branch too — the guard is harmless without TON.)
    if (miniApp.mount.isAvailable()) {
      safeMount(themeParams);
      safeMount(miniApp);
      // Map TG theme params -> CSS vars; our own tokens override the look but
      // this keeps native chrome (header) consistent.
      if (themeParams.isMounted()) themeParams.bindCssVars();
      if (miniApp.isMounted()) miniApp.bindCssVars();
    }

    if (viewport.mount.isAvailable() && !viewport.isMounted()) {
      await viewport
        .mount({ timeout: 3000 })
        .then(() => {
          viewport.bindCssVars();
          // Expand to full height so our layout isn't cramped.
          window.Telegram?.WebApp?.expand?.();
        })
        .catch(() => undefined);
    }
  } catch {
    // Running outside Telegram (e.g. desktop browser dev). Signal ready to the
    // legacy bridge if it exists, otherwise no-op.
    window.Telegram?.WebApp?.ready?.();
  }
}

/**
 * Mint a Dynamic telegramAuthToken from the live WebApp initData.
 *
 * WHY: Telegram strips custom ?query params from web_app launch URLs on iOS, so
 * the ?telegramAuthToken approach from Dynamic's reference bot is unreliable.
 * Instead we post the WebApp initData (always available in the WebView) to our
 * /api/bot?action=mint endpoint, which validates it with the bot token and
 * returns a JWT. We then pass that to telegramSignIn({ authToken }).
 *
 * Returns the token, or null if not inside Telegram / minting failed.
 */
export async function mintAuthToken(): Promise<string | null> {
  const initData = (() => {
    try {
      return window.Telegram?.WebApp?.initData ?? "";
    } catch {
      return "";
    }
  })();
  if (!initData) return null;

  try {
    const res = await fetch("/api/bot?action=mint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { telegramAuthToken?: string };
    return json.telegramAuthToken ?? null;
  } catch {
    return null;
  }
}

/** True when we're actually inside the Telegram WebView. */
export function isInsideTelegram(): boolean {
  try {
    return Boolean(window.Telegram?.WebApp?.initData);
  } catch {
    return false;
  }
}

/** Fire a success/error/warning notification haptic (no-op outside TG). */
export function notify(type: "success" | "error" | "warning"): void {
  try {
    if (hapticFeedback.notificationOccurred.isAvailable()) {
      hapticFeedback.notificationOccurred(type);
    }
  } catch {
    /* ignore */
  }
}

/** Fire an impact haptic (no-op outside TG). */
export function impact(style: "light" | "medium" | "heavy" = "light"): void {
  try {
    if (hapticFeedback.impactOccurred.isAvailable()) {
      hapticFeedback.impactOccurred(style);
    }
  } catch {
    /* ignore */
  }
}

export { backButton, miniApp };
