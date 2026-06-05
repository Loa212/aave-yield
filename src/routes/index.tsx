import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// MILESTONE 1 placeholder. The real Aave market list + balance card land in M4.
function HomePage() {
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
          <CardTitle>Scaffold online</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Bun + Vite + React + TanStack Router + Tailwind v4 + shadcn are
            wired. Telegram SDK, Dynamic, Omniston, and Aave libs are installed.
          </p>
          <Button className="w-full">Primary button renders</Button>
        </CardContent>
      </Card>
    </main>
  );
}
