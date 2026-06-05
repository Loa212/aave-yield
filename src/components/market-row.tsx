import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { AaveMarket } from "@/hooks/use-aave-markets";
import { cn, formatApy } from "@/lib/utils";

/** One Aave market row: symbol, supply APY, interactive vs "Coming soon". */
export function MarketRow({ market }: { market: AaveMarket }) {
  const content = (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors",
        market.interactive && "hover:border-primary/50 active:scale-[0.99]",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
          {market.symbol.slice(0, 4)}
        </div>
        <div>
          <p className="font-medium">{market.symbol}</p>
          {!market.interactive && (
            <p className="text-xs text-muted-foreground">Coming soon</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="font-semibold text-success">
            {formatApy(market.supplyApy)}
          </p>
          <p className="text-xs text-muted-foreground">Supply APY</p>
        </div>
        {market.interactive && (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
    </div>
  );

  if (market.interactive) {
    return (
      <Link to="/deposit" className="block">
        {content}
      </Link>
    );
  }
  return <div className="opacity-60">{content}</div>;
}
