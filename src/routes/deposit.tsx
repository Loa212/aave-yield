import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/deposit")({
  component: DepositPage,
});

// Real deposit flow (USDT-TON → Omniston HTLC → USDC → Aave supply) lands in M5.
function DepositPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Deposit</h1>
      <p className="text-sm text-muted-foreground">Coming in milestone 5.</p>
    </main>
  );
}
