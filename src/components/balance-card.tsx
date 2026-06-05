import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <Card className="overflow-hidden border-primary/30 bg-gradient-to-b from-primary/10 to-card">
      <CardContent className="space-y-5 pt-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Your USDC on Aave</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight">
              {isLoading ? "—" : formatUsd(supplied)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-success">
            <TrendingUp className="h-4 w-4" />
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
