import { useTelegramLogin } from "@dynamic-labs/sdk-react-core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { isInsideTelegram, notify } from "@/lib/telegram";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});

/** True if the launch URL carries the Dynamic telegramAuthToken (query param). */
function hasAuthToken(): boolean {
  if (typeof window === "undefined") return false;
  // Dynamic reads it from searchParams; Telegram appends its own #hash after it.
  return new URL(window.location.href).searchParams.has("telegramAuthToken");
}

function SignInPage() {
  const navigate = useNavigate();
  const { telegramSignIn } = useTelegramLogin();
  const { isAuthenticated, sdkHasLoaded, evmAddress } = useDynamicWallet();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  // Once authenticated AND the EVM wallet has materialized, go home.
  useEffect(() => {
    if (isAuthenticated && evmAddress) {
      notify("success");
      navigate({ to: "/" });
    }
  }, [isAuthenticated, evmAddress, navigate]);

  async function doSignIn() {
    setError(null);

    // Dynamic reads ?telegramAuthToken from the LAUNCH url. If it's absent, the
    // app was opened from the bot's menu button / direct link instead of the
    // inline "Open" button the /start message sends — telegramSignIn() would
    // fail silently. Tell the user how to fix it instead of looking broken.
    if (!hasAuthToken()) {
      setError(
        "Open the app from the bot's Start button. Send /start to the bot and tap “Open Aave Yield”.",
      );
      notify("error");
      return;
    }

    setSigningIn(true);
    try {
      // forceCreateUser: true so a brand-new Telegram user gets a wallet
      // provisioned on first tap (the "seamless onboarding" in the plan).
      await telegramSignIn({ forceCreateUser: true });
    } catch (e) {
      console.error("Telegram sign-in failed", e);
      setError(
        e instanceof Error ? e.message : "Sign-in failed. Please try again.",
      );
      notify("error");
    } finally {
      setSigningIn(false);
    }
  }

  // Inside Telegram we can auth in one tap with no UI friction — attempt it
  // automatically once the SDK is ready. Outside TG we wait for a manual tap.
  // doSignIn is intentionally excluded from deps: this must fire once on
  // readiness, not re-run when the callback identity changes; autoTried guards
  // single-shot.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (sdkHasLoaded && !isAuthenticated && !autoTried && isInsideTelegram()) {
      setAutoTried(true);
      void doSignIn();
    }
  }, [sdkHasLoaded, isAuthenticated, autoTried]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Aave Yield</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          One tap to create your wallet and start earning USD yield on your
          USDT-TON. No seed phrases.
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          <Button
            size="lg"
            className="w-full"
            onClick={doSignIn}
            disabled={signingIn || !sdkHasLoaded}
          >
            {signingIn || !sdkHasLoaded ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {sdkHasLoaded ? "Signing in…" : "Loading…"}
              </>
            ) : (
              "Sign in with Telegram"
            )}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <p className="text-xs text-muted-foreground">
            Powered by Dynamic. Your Telegram identity controls a stable EVM
            wallet on Base.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
