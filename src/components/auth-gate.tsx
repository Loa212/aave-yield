import { type PropsWithChildren, useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
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
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
