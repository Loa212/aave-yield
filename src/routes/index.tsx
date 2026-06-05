import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { shortenAddress } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// M3: prove the Dynamic EVM EOA materialized. The Aave market list + balance
// card (M4) and deposit/withdraw entry points (M5/M6) layer on top of this.
function HomePage() {
  const { evmAddress, tonAddress } = useDynamicWallet();

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex items-center justify-between py-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aave Yield</h1>
          <p className="text-sm text-muted-foreground">
            USD yield on your USDT-TON
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            Your wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">EVM (Base)</span>
            <code className="font-mono text-foreground">
              {evmAddress ? shortenAddress(evmAddress) : "—"}
            </code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">TON</span>
            <code className="font-mono text-foreground">
              {tonAddress ? shortenAddress(tonAddress, 6) : "—"}
            </code>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
