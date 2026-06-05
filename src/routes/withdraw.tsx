import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { type ProgressStep, TxProgress } from "@/components/tx-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBackButton } from "@/hooks/use-back-button";
import { useDynamicWallet } from "@/hooks/use-dynamic-wallet";
import { useOmnistonQuote } from "@/hooks/use-omniston-quote";
import { useUsdcSupplyBalance } from "@/hooks/use-usdc-supply-balance";
import { useWithdraw, type WithdrawStage } from "@/hooks/use-withdraw";
import { USDC_DECIMALS } from "@/lib/aave";
import { impact, notify } from "@/lib/telegram";
import { formatUsd } from "@/lib/utils";

export const Route = createFileRoute("/withdraw")({
  component: WithdrawPage,
});

const STEPS: ProgressStep[] = [
  {
    key: "withdrawing",
    label: "Withdrawing from Aave",
    hint: "Confirm on Base",
  },
  { key: "ordering", label: "Signing the bridge order", hint: "One signature" },
  {
    key: "settling",
    label: "Bridging to TON",
    hint: "HTLC swap — usually 2–5 min. You can close the app.",
  },
  { key: "done", label: "Done — USDT in your TON wallet" },
];

function stageToIndex(stage: WithdrawStage): number {
  switch (stage) {
    case "withdrawing":
      return 0;
    case "ordering":
      return 1;
    case "settling":
      return 2;
    case "done":
      return 3;
    default:
      return 0;
  }
}

function WithdrawPage() {
  const navigate = useNavigate();
  useBackButton("/");
  const { evmAddress, tonAddress } = useDynamicWallet();
  const balance = useUsdcSupplyBalance(evmAddress);
  const supplied = balance.data?.supplied ?? 0;

  const [amount, setAmount] = useState("");
  const { quote, isFetching, noQuote } = useOmnistonQuote("withdraw", amount);
  const { state, runWithdraw, reset } = useWithdraw();

  const running = state.stage !== "idle";
  const expectedUsdt = quote
    ? Number(formatUnits(BigInt(quote.outputUnits), USDC_DECIMALS))
    : 0;

  const overBalance = Number(amount) > supplied + 1e-6;

  useEffect(() => {
    if (state.stage === "done") notify("success");
    if (state.stage === "error") notify("error");
  }, [state.stage]);

  const canConfirm =
    !running &&
    Boolean(quote) &&
    Number(amount) > 0 &&
    !overBalance &&
    Boolean(tonAddress);

  function onConfirm() {
    if (!quote) return;
    impact("medium");
    void runWithdraw(quote, parseUnits(amount, USDC_DECIMALS));
  }

  if (running) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-4">
        <h1 className="pt-2 text-xl font-semibold">Withdrawing</h1>
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
          <Button className="w-full" onClick={() => navigate({ to: "/" })}>
            Back home
          </Button>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-4">
      <h1 className="pt-2 text-xl font-semibold">Withdraw</h1>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                You withdraw
              </span>
              <button
                type="button"
                className="text-xs text-primary"
                onClick={() => setAmount(String(supplied))}
              >
                Max {formatUsd(supplied)}
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
              <span className="shrink-0 font-medium text-muted-foreground">
                USDC
              </span>
            </div>
            {overBalance && (
              <p className="text-xs text-destructive">
                Amount exceeds your supplied balance.
              </p>
            )}
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm text-muted-foreground">
              You receive (in your TON wallet)
            </span>
            <div className="flex items-center justify-between rounded-md border border-input bg-secondary/30 px-3 py-2.5">
              <span className="text-lg font-medium">
                {isFetching && !quote ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  expectedUsdt.toFixed(2)
                )}
              </span>
              <span className="font-medium text-muted-foreground">
                USDT-TON
              </span>
            </div>
            {noQuote && amount && !overBalance && (
              <p className="text-xs text-destructive">
                No route available for this amount right now.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        We withdraw your USDC from Aave, then bridge it to USDT on TON via
        STON.fi's HTLC swap (~2–5 min). You'll sign the withdrawal on Base and a
        single permit — no separate approval transaction.
      </p>

      <Button
        size="lg"
        className="mt-auto w-full"
        disabled={!canConfirm}
        onClick={onConfirm}
      >
        {!tonAddress
          ? "No TON wallet"
          : isFetching && !quote
            ? "Fetching quote…"
            : "Confirm withdraw"}
      </Button>
    </main>
  );
}

function sanitizeAmount(v: string): string {
  const cleaned = v.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, USDC_DECIMALS)}`;
}
