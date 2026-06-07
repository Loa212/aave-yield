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
import { shortenAddress } from "@/lib/utils";

type ReceiveNetwork = "ton" | "base";

interface ReceiveSearch {
  network?: ReceiveNetwork;
}

export const Route = createFileRoute("/receive")({
  validateSearch: (s: Record<string, unknown>): ReceiveSearch => ({
    network: s.network === "base" ? "base" : "ton",
  }),
  component: ReceivePage,
});

const NETWORKS = {
  ton: {
    label: "TON",
    fullName: "The Open Network",
    tokens: ["USDT", "TON"],
    note: "Send USDT or TON on the TON network to this address.",
  },
  base: {
    label: "Base",
    fullName: "Base network",
    tokens: ["USDC"],
    note: "Send only USDC via the Base network. Other assets may be lost.",
  },
} as const;

function ReceivePage() {
  useBackButton("/");
  const { network = "ton" } = useSearch({ from: "/receive" });
  const { tonAddress, evmAddress } = useDynamicWallet();

  const address = network === "ton" ? tonAddress : evmAddress;
  const meta = NETWORKS[network];

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        {/* Overlapping token icons, TON-Wallet style. */}
        <div className="flex">
          {meta.tokens.map((t, i) => (
            <TokenIcon
              key={t}
              symbol={t}
              size={56}
              className={i > 0 ? "-ml-4 ring-2 ring-background" : ""}
            />
          ))}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Receive {meta.tokens.join(" / ")}
          </h1>
          <p className="text-sm text-muted-foreground">on {meta.fullName}</p>
        </div>
      </div>

      {address ? (
        <ReceiveCard address={address} note={meta.note} />
      ) : (
        <Card className="w-full max-w-sm">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No {meta.label} wallet found. Sign in again.
          </CardContent>
        </Card>
      )}

      <NetworkInfo network={network} />
    </main>
  );
}

function ReceiveCard({ address, note }: { address: string; note: string }) {
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

        <p className="px-1 text-center text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

function NetworkInfo({ network }: { network: ReceiveNetwork }) {
  const rows =
    network === "ton"
      ? [
          ["Network", "TON"],
          ["Tokens", "USDT, TON"],
        ]
      : [
          ["Network", "Base (BASE)"],
          ["Token", "USDC"],
        ];

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="divide-y divide-border py-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-3">
            <span className="text-sm text-muted-foreground">{k}</span>
            <span className="text-sm font-medium">{v}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Re-exported for callers that want the short form (kept for parity with the
// settings sheet's display).
export { shortenAddress };
