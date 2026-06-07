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
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            Your TON wallet
          </span>
          <Link
            to="/receive"
            search={{ network: "ton" }}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground active:scale-95"
          >
            <QrCode className="h-3.5 w-3.5" />
            Receive
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <TokenBalanceRow
            symbol="USDT"
            label="USDT-TON"
            amount={data?.usdt}
            isLoading={isLoading}
          />
          <TokenBalanceRow
            symbol="TON"
            label="Toncoin"
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
  amount,
  isLoading,
}: {
  symbol: string;
  label: string;
  amount: number | undefined;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <TokenIcon symbol={symbol} size={32} />
        <span className="font-medium">{label}</span>
      </div>
      <span className="font-semibold tabular-nums">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          (amount ?? 0).toLocaleString(undefined, {
            maximumFractionDigits: 4,
          })
        )}
      </span>
    </div>
  );
}
