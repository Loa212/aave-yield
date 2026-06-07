import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp } from "lucide-react";
import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatApy, formatUsd } from "@/lib/utils";

interface BalanceCardProps {
  supplied: number;
  apy: number;
  isLoading?: boolean;
}

/** "Your USDC on Aave: $X earning Y% APY" + deposit/withdraw actions. */
export function BalanceCard({ supplied, apy, isLoading }: BalanceCardProps) {
  const hasPosition = supplied > 0.000001;

  return (
    <Card className="relative overflow-hidden border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card shadow-(--shadow-card)">
      {/* Soft brand glow in the corner — Aave-style depth. */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />

      <CardContent className="relative space-y-5 pt-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TokenIcon symbol="USDC" size={20} />
            <p className="text-sm text-muted-foreground">Your USDC on Aave</p>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight tabular-nums">
              {isLoading ? "—" : formatUsd(supplied)}
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-1 text-sm font-medium text-success">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>
              {hasPosition ? "Earning " : "Supply to earn "}
              {formatApy(apy)} APY
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button asChild className="w-full">
            <Link to="/deposit">
              <ArrowDownToLine className="h-4 w-4" />
              Deposit
            </Link>
          </Button>
          <Button
            asChild
            variant="secondary"
            className="w-full"
            disabled={!hasPosition}
          >
            <Link to="/withdraw">
              <ArrowUpFromLine className="h-4 w-4" />
              Withdraw
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
