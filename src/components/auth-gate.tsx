import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type PropsWithChildren, useEffect } from "react";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";

/**
 * Route-level auth gate.
 *
 * - While Dynamic is bootstrapping, show a spinner (avoids a sign-in flash for
 *   already-authenticated users on cold start).
 * - If not authenticated and not already on /sign-in, redirect there.
 * - The /sign-in route itself is always allowed through.
 */
export function AuthGate({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { sdkHasLoaded, isAuthenticated } = useDynamicWallet();

  const isSignInRoute = pathname === "/sign-in";

  useEffect(() => {
    if (!sdkHasLoaded) return;
    if (!isAuthenticated && !isSignInRoute) {
      navigate({ to: "/sign-in" });
    }
  }, [sdkHasLoaded, isAuthenticated, isSignInRoute, navigate]);

  if (!sdkHasLoaded) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {/* TEMP DEBUG: surfaces why we're stuck when there's no console (TG WebView).
            Remove before the Loom. */}
        <DebugReadout sdkHasLoaded={sdkHasLoaded} />
      </div>
    );
  }

  // Block protected content from flashing before the redirect lands.
  if (!isAuthenticated && !isSignInRoute) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}

// TEMP DEBUG: on-screen readout for the Telegram WebView (no console there).
function DebugReadout({ sdkHasLoaded }: { sdkHasLoaded: boolean }) {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const hasToken = url.includes("telegramAuthToken=");
  const inTg = (() => {
    try {
      return Boolean(window.Telegram?.WebApp?.initData);
    } catch {
      return false;
    }
  })();
  const envId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID ?? "";
  return (
    <div className="max-w-xs break-words rounded-md border border-border bg-card p-3 text-left text-[11px] text-muted-foreground">
      <div>sdkHasLoaded: {String(sdkHasLoaded)}</div>
      <div>envId set: {envId ? `yes (${envId.slice(0, 8)}…)` : "NO"}</div>
      <div>token in URL: {String(hasToken)}</div>
      <div>inside Telegram: {String(inTg)}</div>
      <div className="mt-1 opacity-60">href: {url.slice(0, 80)}</div>
    </div>
  );
}
