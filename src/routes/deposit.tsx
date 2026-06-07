import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { TokenIcon } from "@/components/token-icon";
import { type ProgressStep, TxProgress } from "@/components/tx-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBackButton } from "@/hooks/use-back-button";
import { type DepositStage, useDeposit } from "@/hooks/use-deposit";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import {
  USDT_TON_DECIMALS,
  useOmnistonQuote,
} from "@/hooks/use-omniston-quote";
import { useTonBalances } from "@/hooks/use-ton-balances";
import { USDC_DECIMALS } from "@/lib/aave";
import { impact, notify } from "@/lib/telegram";
import { formatUsd } from "@/lib/utils";

export const Route = createFileRoute("/deposit")({
  component: DepositPage,
});

const STEPS: ProgressStep[] = [
  {
    key: "bridging",
    label: "Bridging from TON",
    hint: "Confirm in your wallet",
  },
  {
    key: "settling",
    label: "Settling on Base",
    hint: "HTLC swap — usually 2–5 min. You can close the app.",
  },
  { key: "supplying", label: "Supplying to Aave", hint: "Almost done" },
  { key: "done", label: "Done — earning yield" },
];

function stageToIndex(stage: DepositStage): number {
  switch (stage) {
    case "bridging":
      return 0;
    case "settling":
      return 1;
    case "supplying":
      return 2;
    case "done":
      return 3;
    default:
      return 0;
  }
}

function DepositPage() {
  const navigate = useNavigate();
  useBackButton("/");
  const { tonAddress, hasTonConnectWallet, connectTonWallet } =
    useDynamicWallet();
  const balances = useTonBalances(tonAddress);
  const usdtBalance = balances.data?.usdt ?? 0;
  const [amount, setAmount] = useState("");
  const [connecting, setConnecting] = useState(false);
  const { quote, isFetching, noQuote } = useOmnistonQuote("deposit", amount);
  const { state, runDeposit, reset } = useDeposit();

  async function onConnectWallet() {
    setConnecting(true);
    try {
      await connectTonWallet();
    } catch (e) {
      console.error("TON Connect failed", e);
    } finally {
      setConnecting(false);
    }
  }

  // Trim trailing zeros so "2.000000" → "2" when tapping Max.
  const setMax = () => setAmount(String(usdtBalance));
  const overBalance = Number(amount) > usdtBalance;

  const running = state.stage !== "idle";
  const expectedUsdc = quote
    ? Number(formatUnits(BigInt(quote.outputUnits), USDC_DECIMALS))
    : 0;

  useEffect(() => {
    if (state.stage === "done") notify("success");
    if (state.stage === "error") notify("error");
  }, [state.stage]);

  const canConfirm =
    !running &&
    Boolean(quote) &&
    Number(amount) > 0 &&
    !overBalance &&
    hasTonConnectWallet &&
    Boolean(tonAddress);

  function onConfirm() {
    if (!quote) return;
    impact("medium");
    void runDeposit(quote);
  }

  if (running) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4">
        <h1 className="pt-2 text-xl font-semibold">Depositing</h1>
        <Card>
          <CardContent className="pt-6">
            <TxProgress
              steps={STEPS}
              activeIndex={stageToIndex(state.stage)}
              errored={state.stage === "error"}
            />
          </CardContent>
        </Card>

        {state.stage === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{state.error}</p>
            <Button variant="secondary" className="w-full" onClick={reset}>
              Try again
            </Button>
          </div>
        )}

        {state.stage === "done" && (
          <div className="space-y-3">
            {state.receivedUsdc != null && (
              <p className="text-center text-sm text-muted-foreground">
                Supplied {formatUsd(state.receivedUsdc)} to Aave.
              </p>
            )}
            <Button className="w-full" onClick={() => navigate({ to: "/" })}>
              View balance
            </Button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-4">
      <h1 className="pt-2 text-xl font-semibold">Deposit</h1>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">You send</span>
              {/* Tap the balance to fill the max. */}
              <button
                type="button"
                onClick={setMax}
                disabled={usdtBalance <= 0}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Balance:{" "}
                <span className="font-medium text-foreground">
                  {balances.isLoading
                    ? "…"
                    : usdtBalance.toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })}
                </span>{" "}
                <span className="font-semibold text-primary">Max</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
                className="text-lg"
              />
              <span className="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground">
                <TokenIcon symbol="USDT" size={20} />
                USDT-TON
              </span>
            </div>
            {overBalance && (
              <p className="text-xs text-destructive">
                Amount exceeds your USDT-TON balance.
              </p>
            )}
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm text-muted-foreground">
              You receive (on Aave Base)
            </span>
            <div className="flex items-center justify-between rounded-md border border-input bg-secondary/30 px-3 py-2.5">
              <span className="text-lg font-medium">
                {isFetching && !quote ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  expectedUsdc.toFixed(2)
                )}
              </span>
              <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <TokenIcon symbol="USDC" size={20} />
                USDC
              </span>
            </div>
            {noQuote && amount && (
              <p className="text-xs text-destructive">
                No route available for this amount right now.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        Your USDT bridges from TON to USDC on Base via STON.fi's HTLC swap (~2–5
        min), then is supplied to Aave V3 to earn yield. You'll sign the
        transfer in your connected TON wallet.
      </p>

      {hasTonConnectWallet ? (
        <Button
          size="lg"
          className="mt-auto w-full"
          disabled={!canConfirm}
          onClick={onConfirm}
        >
          {isFetching && !quote ? "Fetching quote…" : "Confirm deposit"}
        </Button>
      ) : (
        // The deposit signs an HTLC escrow transfer, which only works through a
        // real TON Connect wallet (the WaaS provisioned wallet's send path is
        // broken in the Telegram WebView). Require connecting one first.
        <Button
          size="lg"
          className="mt-auto w-full"
          disabled={connecting}
          onClick={onConnectWallet}
        >
          {connecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting…
            </>
          ) : (
            "Connect TON wallet to deposit"
          )}
        </Button>
      )}
    </main>
  );
}

/** Keep only digits and a single decimal point. */
function sanitizeAmount(v: string): string {
  const cleaned = v.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, USDT_TON_DECIMALS)}`;
}
