import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressStep {
  key: string;
  label: string;
  /** Sub-text shown under the label (e.g. "~3 min"). */
  hint?: string;
}

export type StepStatus = "pending" | "active" | "done" | "error";

interface TxProgressProps {
  steps: ProgressStep[];
  /** Index of the currently-active step. */
  activeIndex: number;
  /** True if the flow errored at activeIndex. */
  errored?: boolean;
}

/**
 * Multi-stage progress for cross-chain HTLC bridges. Honest about timing —
 * settlement takes minutes, so we surface that rather than faking a fast bar.
 */
export function TxProgress({ steps, activeIndex, errored }: TxProgressProps) {
  return (
    <ol className="flex flex-col gap-1">
      {steps.map((step, i) => {
        let status: StepStatus = "pending";
        if (i < activeIndex) status = "done";
        else if (i === activeIndex) status = errored ? "error" : "active";

        return (
          <li key={step.key} className="flex items-start gap-3 py-2">
            <StepIcon status={status} />
            <div className="flex flex-col">
              <span
                className={cn(
                  "text-sm font-medium",
                  status === "pending" && "text-muted-foreground",
                  status === "error" && "text-destructive",
                )}
              >
                {step.label}
              </span>
              {step.hint && status === "active" && (
                <span className="text-xs text-muted-foreground">
                  {step.hint}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  const base =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border";
  switch (status) {
    case "done":
      return (
        <div className={cn(base, "border-success bg-success/15 text-success")}>
          <Check className="h-3.5 w-3.5" />
        </div>
      );
    case "active":
      return (
        <div className={cn(base, "border-primary bg-primary/15 text-primary")}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </div>
      );
    case "error":
      return (
        <div
          className={cn(
            base,
            "border-destructive bg-destructive/15 text-destructive",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </div>
      );
    default:
      return (
        <div className={cn(base, "border-border text-muted-foreground")}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        </div>
      );
  }
}
