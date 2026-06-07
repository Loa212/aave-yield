import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBackButton } from "@/hooks/use-back-button";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { impact } from "@/lib/telegram";

/** Which specific asset the user is funding. One token per screen — no ambiguity. */
type ReceiveToken = "usdt" | "ton" | "usdc";

interface ReceiveSearch {
  token: ReceiveToken;
}

export const Route = createFileRoute("/receive")({
  validateSearch: (s: Record<string, unknown>): ReceiveSearch => ({
    token: s.token === "ton" || s.token === "usdc" ? s.token : "usdt", // default to USDT-TON (the deposit input asset)
  }),
  component: ReceivePage,
});

const TOKENS = {
  usdt: {
    symbol: "USDT",
    title: "USDT",
    network: "TON",
    networkFull: "the TON network",
    wallet: "ton" as const,
    warning:
      "Send only USDT (the jetton) on the TON network. Sending any other token or network may lose it.",
  },
  ton: {
    symbol: "TON",
    title: "Toncoin",
    network: "TON",
    networkFull: "the TON network",
    wallet: "ton" as const,
    warning:
      "Send only Toncoin (TON) on the TON network. Sending any other token or network may lose it.",
  },
  usdc: {
    symbol: "USDC",
    title: "USDC",
    network: "Base",
    networkFull: "the Base network",
    wallet: "base" as const,
    warning:
      "Send only USDC on the Base network. Sending any other token or network may lose it.",
  },
} as const;

function ReceivePage() {
  useBackButton("/");
  const { token } = useSearch({ from: "/receive" });
  const { tonAddress, evmAddress } = useDynamicWallet();

  const meta = TOKENS[token];
  const address = meta.wallet === "ton" ? tonAddress : evmAddress;

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <TokenIcon symbol={meta.symbol} size={56} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Receive {meta.title}
          </h1>
          <p className="text-sm text-muted-foreground">on {meta.networkFull}</p>
        </div>
      </div>

      {address ? (
        <ReceiveCard address={address} warning={meta.warning} />
      ) : (
        <Card className="w-full max-w-sm">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No {meta.network} wallet found. Sign in again.
          </CardContent>
        </Card>
      )}

      <Card className="w-full max-w-sm">
        <CardContent className="divide-y divide-border py-1">
          <InfoRow k="Token" v={meta.title} />
          <InfoRow k="Network" v={meta.network} />
        </CardContent>
      </Card>
    </main>
  );
}

function ReceiveCard({
  address,
  warning,
}: {
  address: string;
  warning: string;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(address, {
      width: 320,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [address]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      impact("light");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <Card className="w-full max-w-sm shadow-(--shadow-card)">
      <CardContent className="flex flex-col items-center gap-4 pt-6">
        {qr && (
          <div className="rounded-2xl bg-white p-3">
            <img src={qr} alt="Wallet address QR" className="h-44 w-44" />
          </div>
        )}

        <p className="break-all text-center font-mono text-sm text-muted-foreground">
          {address}
        </p>

        <Button className="w-full" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy address
            </>
          )}
        </Button>

        <p className="px-1 text-center text-xs text-warning">{warning}</p>
      </CardContent>
    </Card>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className="text-sm font-medium">{v}</span>
    </div>
  );
}
