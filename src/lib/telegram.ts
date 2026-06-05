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

    if (miniApp.mount.isAvailable()) {
      themeParams.mount();
      miniApp.mount();
      // Map TG theme params -> CSS vars; our own tokens override the look but
      // this keeps native chrome (header) consistent.
      themeParams.bindCssVars();
      miniApp.bindCssVars();
    }

    if (viewport.mount.isAvailable()) {
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
