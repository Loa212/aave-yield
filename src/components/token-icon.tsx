import { TokenIcon as Web3TokenIcon } from "@web3icons/react/dynamic";
import { cn } from "@/lib/utils";

/**
 * Token logo for an Aave market. Wraps @web3icons' dynamic TokenIcon (branded,
 * lazy-loaded) and falls back to a tidy lettered chip for symbols web3icons
 * doesn't carry (e.g. USDbC) so the list never shows a broken/empty slot.
 */
export function TokenIcon({
  symbol,
  size = 36,
  className,
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  return (
    <Web3TokenIcon
      symbol={symbol}
      variant="branded"
      size={size}
      className={cn("shrink-0 rounded-full", className)}
      fallback={<LetterChip symbol={symbol} size={size} />}
    />
  );
}

/** Lettered fallback chip — mirrors the icon's round shape and size. */
function LetterChip({ symbol, size }: { symbol: string; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-muted-foreground"
      style={{ width: size, height: size, fontSize: size * 0.3 }}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}
