import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type PropsWithChildren, useEffect, useReducer, useState } from "react";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { getDebugEntries, subscribeDebug } from "@/lib/debug-log";

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
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
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
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [elapsed, setElapsed] = useState(0);

  // Re-render when new debug entries arrive.
  useEffect(() => subscribeDebug(force), []);

  // Elapsed-time watchdog so we can tell "slow" from "truly hung".
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
  const entries = getDebugEntries();

  return (
    <div className="w-full max-w-sm space-y-2 rounded-md border border-border bg-card p-3 text-left font-mono text-[11px] text-muted-foreground">
      <div className="space-y-0.5">
        <div>
          sdkHasLoaded: <b>{String(sdkHasLoaded)}</b> · {elapsed}s
        </div>
        <div>envId: {envId ? `${envId.slice(0, 8)}…` : "NONE"}</div>
        <div>token in URL: {String(hasToken)}</div>
        <div>inside TG: {String(inTg)}</div>
      </div>

      <div className="border-t border-border pt-1.5">
        <div className="mb-1 opacity-70">log:</div>
        {entries.length === 0 ? (
          <div className="opacity-50">(no entries)</div>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {entries.map((e, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: temp debug log, append-only
                key={i}
                className={
                  e.kind === "error"
                    ? "text-destructive"
                    : e.kind === "net"
                      ? "text-primary"
                      : ""
                }
              >
                +{e.t}ms {e.kind === "info" ? "" : `[${e.kind}] `}
                {e.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
