import { Link } from "@tanstack/react-router";
import { Loader2, QrCode } from "lucide-react";
import { TokenIcon } from "@/components/token-icon";
import { Card, CardContent } from "@/components/ui/card";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { useTonBalances } from "@/hooks/use-ton-balances";

/**
 * The user's TON-side wallet: live USDT + TON balances and a Receive shortcut.
 * This is the funding source for deposits (USDT-TON → USDC → Aave), so we keep
 * it on the home screen above the Aave position.
 */
export function WalletCard() {
  const { tonAddress } = useDynamicWallet();
  const { data, isLoading } = useTonBalances(tonAddress);

  return (
    <Card className="shadow-(--shadow-card)">
      <CardContent className="space-y-3 pt-5">
        <span className="text-sm font-semibold text-muted-foreground">
          Your TON wallet
        </span>

        <div className="flex flex-col gap-2">
          <TokenBalanceRow
            symbol="USDT"
            label="USDT-TON"
            token="usdt"
            amount={data?.usdt}
            isLoading={isLoading}
          />
          <TokenBalanceRow
            symbol="TON"
            label="Toncoin"
            token="ton"
            amount={data?.ton}
            isLoading={isLoading}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TokenBalanceRow({
  symbol,
  label,
  token,
  amount,
  isLoading,
}: {
  symbol: string;
  label: string;
  token: "usdt" | "ton";
  amount: number | undefined;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <TokenIcon symbol={symbol} size={32} />
        <span className="font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold tabular-nums">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            (amount ?? 0).toLocaleString(undefined, {
              maximumFractionDigits: 4,
            })
          )}
        </span>
        <Link
          to="/receive"
          search={{ token }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground active:scale-95"
          aria-label={`Receive ${label}`}
        >
          <QrCode className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
