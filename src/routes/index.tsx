import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { BalanceCard } from "@/components/balance-card";
import { MarketRow } from "@/components/market-row";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { useAaveMarkets } from "@/hooks/use-aave-markets";
import { useUsdcSupplyBalance } from "@/hooks/use-usdc-supply-balance";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { evmAddress } = useDynamicWallet();
  const markets = useAaveMarkets();
  const balance = useUsdcSupplyBalance(evmAddress);

  // USDC APY for the balance card: prefer the balance query's reading, fall
  // back to the markets list so the card isn't blank while one query loads.
  const usdcApy =
    balance.data?.apy ??
    markets.data?.find((m) => m.symbol === "USDC")?.supplyApy ??
    0;

  return (
    <main className="flex flex-1 flex-col gap-5 p-4">
      <header className="flex items-center justify-between py-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aave Yield</h1>
          <p className="text-sm text-muted-foreground">
            USD yield on your USDT-TON
          </p>
        </div>
      </header>

      <BalanceCard
        supplied={balance.data?.supplied ?? 0}
        apy={usdcApy}
        isLoading={balance.isLoading}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Aave Base markets
          </h2>
          {markets.isFetching && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {markets.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : markets.isError ? (
          <p className="px-1 text-sm text-destructive">
            Couldn't load markets. Pull to retry.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {markets.data?.map((m) => (
              <MarketRow key={m.symbol} market={m} />
            ))}
          </div>
        )}
      </section>

      <p className="px-1 pb-4 pt-2 text-center text-xs text-muted-foreground">
        Powered by STON.fi Omniston · Aave V3 · Dynamic
      </p>
    </main>
  );
}
