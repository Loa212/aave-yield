import { useNavigate } from "@tanstack/react-router";
import { Check, Copy, ExternalLink, LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { impact } from "@/lib/telegram";
import { shortenAddress } from "@/lib/utils";

/** EOA address, sign out, and credits. Opened from the home header gear icon. */
export function SettingsSheet() {
  const navigate = useNavigate();
  const { evmAddress, tonAddress, signOut } = useDynamicWallet();
  const { toast } = useToast();
  const [copied, setCopied] = useState<"evm" | "ton" | null>(null);

  async function copy(value: string, which: "evm" | "ton") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      impact("light");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast("Couldn't copy to clipboard", "error");
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/sign-in" });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="gap-5 pb-8">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <AddressRow
            label="EVM wallet (Base)"
            address={evmAddress}
            copied={copied === "evm"}
            onCopy={() => evmAddress && copy(evmAddress, "evm")}
            explorerHref={
              evmAddress
                ? `https://basescan.org/address/${evmAddress}`
                : undefined
            }
          />
          <AddressRow
            label="TON wallet"
            address={tonAddress}
            copied={copied === "ton"}
            onCopy={() => tonAddress && copy(tonAddress, "ton")}
            explorerHref={
              tonAddress ? `https://tonviewer.com/${tonAddress}` : undefined
            }
          />
        </div>

        <Button variant="outline" className="w-full" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Powered by Dynamic · STON.fi Omniston · Aave V3
          <br />
          Your Telegram identity controls a stable, exportable EVM key.
        </p>
      </SheetContent>
    </Sheet>
  );
}

function AddressRow({
  label,
  address,
  copied,
  onCopy,
  explorerHref,
}: {
  label: string;
  address: string | undefined;
  copied: boolean;
  onCopy: () => void;
  explorerHref?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-sm">
          {address ? shortenAddress(address, 6) : "—"}
        </code>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onCopy}
            disabled={!address}
            aria-label={`Copy ${label}`}
          >
            {copied ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          {explorerHref && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`View ${label} on explorer`}
            >
              <a href={explorerHref} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
