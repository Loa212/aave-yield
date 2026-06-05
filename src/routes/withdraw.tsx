import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/withdraw")({
  component: WithdrawPage,
});

// Real withdraw flow (Aave withdraw → USDC → Omniston HTLC → USDT-TON) lands in M6.
function WithdrawPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Withdraw</h1>
      <p className="text-sm text-muted-foreground">Coming in milestone 6.</p>
    </main>
  );
}
