import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type PropsWithChildren, useEffect, useState } from "react";
import { DebugReadout } from "@/components/debug-readout";
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

  // Fallback: if Dynamic's init never completes (e.g. an unhandled rejection
  // during bootstrap leaves sdkHasLoaded stuck false), don't spin forever —
  // after a timeout, send the user to /sign-in so they can recover instead of
  // staring at a hung spinner.
  const [initTimedOut, setInitTimedOut] = useState(false);
  useEffect(() => {
    if (sdkHasLoaded) return;
    const id = setTimeout(() => setInitTimedOut(true), 8000);
    return () => clearTimeout(id);
  }, [sdkHasLoaded]);

  const ready = sdkHasLoaded || initTimedOut;

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated && !isSignInRoute) {
      navigate({ to: "/sign-in" });
    }
  }, [ready, isAuthenticated, isSignInRoute, navigate]);

  if (!ready) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {/* TEMP DEBUG: surfaces why we're stuck when there's no console (TG WebView).
            Remove before the Loom. */}
        <DebugReadout label="AuthGate spinner" />
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
