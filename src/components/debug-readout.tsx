// TEMP DEBUG: on-screen log readout for the Telegram WebView (no console there).
// Remove this file + its usages before the Loom.
import { useEffect, useReducer, useState } from "react";
import { getDebugEntries, subscribeDebug } from "@/lib/debug-log";

export function DebugReadout({ label }: { label?: string }) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => subscribeDebug(force), []);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const url = typeof window !== "undefined" ? window.location.href : "";
  const hasToken = url.includes("telegramAuthToken=");
  const inTg = (() => {
    try {
      return Boolean(window.Telegram?.WebApp?.initData);
    } catch {
      return false;
    }
  })();
  // Where did Telegram put our query param? Dump every candidate location.
  const wa = (() => {
    try {
      return window.Telegram?.WebApp as
        | {
            initData?: string;
            initDataUnsafe?: { start_param?: string };
          }
        | undefined;
    } catch {
      return undefined;
    }
  })();
  const startParam = wa?.initDataUnsafe?.start_param ?? "";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const envId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID ?? "";
  const entries = getDebugEntries();

  return (
    <div className="w-full max-w-sm space-y-2 rounded-md border border-border bg-card p-3 text-left font-mono text-[11px] text-muted-foreground">
      <div className="space-y-0.5">
        {label && <div className="opacity-70">{label}</div>}
        <div>elapsed: {elapsed}s</div>
        <div>envId: {envId ? `${envId.slice(0, 8)}…` : "NONE"}</div>
        <div>token in URL: {String(hasToken)}</div>
        <div>inside TG: {String(inTg)}</div>
        <div className="break-all">search: {search || "(empty)"}</div>
        <div className="break-all">
          start_param: {startParam ? `${startParam.slice(0, 40)}…` : "(empty)"}
        </div>
        <div className="break-all">
          hash: {hash ? `${hash.slice(0, 50)}…` : "(empty)"}
        </div>
      </div>
      <div className="border-t border-border pt-1.5">
        <div className="mb-1 opacity-70">log:</div>
        {entries.length === 0 ? (
          <div className="opacity-50">(no entries)</div>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {entries.map((e, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: temp debug log, append-only
                key={i}
                className={
                  e.kind === "error"
                    ? "text-destructive"
                    : e.kind === "net"
                      ? "text-primary"
                      : ""
                }
              >
                +{e.t}ms {e.kind === "info" ? "" : `[${e.kind}] `}
                {e.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
