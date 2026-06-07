import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { DebugReadout } from "@/components/debug-readout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { dbg } from "@/lib/debug-log";
import { telegramOAuthSignIn } from "@/lib/dynamic-telegram-auth";
import { isInsideTelegram, mintAuthToken, notify } from "@/lib/telegram";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const { isAuthenticated, sdkHasLoaded, evmAddress } = useDynamicWallet();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  // TEMP DEBUG: trace auth-state transitions so we can see where it stalls.
  useEffect(() => {
    dbg(
      "info",
      `auth state: isAuthenticated=${isAuthenticated} evmAddress=${evmAddress ?? "none"}`,
    );
  }, [isAuthenticated, evmAddress]);

  // Once authenticated AND the EVM wallet has materialized, go home.
  useEffect(() => {
    if (isAuthenticated && evmAddress) {
      dbg("info", "authenticated + evm ready → navigating home");
      notify("success");
      navigate({ to: "/" });
    }
  }, [isAuthenticated, evmAddress, navigate]);

  async function doSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      // Mint the telegramAuthToken + telegramUser from the live WebApp initData
      // (our /api/bot?action=mint validates it server-side). Telegram strips
      // ?telegramAuthToken from web_app launch URLs on iOS, so we always mint.
      dbg("info", "minting auth token from initData…");
      const minted = await mintAuthToken();
      dbg("info", `mint result: ${minted ? "got token+user" : "null"}`);

      if (!minted) {
        setError(
          "Couldn't authenticate with Telegram. Open the app from inside Telegram (the bot's Open button).",
        );
        notify("error");
        return;
      }

      // Drive the OAuth code+state flow our Dynamic provider requires (the bare
      // telegramSignIn({authToken}) path 400s on this env — see
      // src/lib/dynamic-telegram-auth.ts for the full reverse-engineered flow).
      dbg("info", "telegramOAuthSignIn() calling…");
      await telegramOAuthSignIn(minted.telegramAuthToken, minted.telegramUser);
      dbg("info", "telegramOAuthSignIn() returned ok");
    } catch (e) {
      dbg("error", `sign-in threw: ${String(e)}`);
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

      {/* TEMP DEBUG: remove before the Loom. */}
      <DebugReadout label="sign-in" />
    </main>
  );
}
