import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});

// Real Dynamic Telegram auth ceremony lands in M3.
function SignInPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="text-sm text-muted-foreground">Coming in milestone 3.</p>
    </main>
  );
}
