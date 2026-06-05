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
  const [copied, setCopied] = useState(false);

  function copyAll() {
    const text = [
      `label: ${label ?? ""}`,
      `elapsed: ${elapsed}s`,
      `envId: ${envId}`,
      `token in URL: ${hasToken}`,
      `inside TG: ${inTg}`,
      `search: ${search || "(empty)"}`,
      `start_param: ${startParam || "(empty)"}`,
      `hash: ${hash || "(empty)"}`,
      `href: ${url}`,
      "--- log ---",
      ...entries.map(
        (e) => `+${e.t}ms ${e.kind === "info" ? "" : `[${e.kind}] `}${e.msg}`,
      ),
    ].join("\n");

    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    try {
      navigator.clipboard
        .writeText(text)
        .then(done)
        // Fallback for WebViews where navigator.clipboard is blocked: a hidden
        // textarea + execCommand still works.
        .catch(() => {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          done();
        });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="w-full max-w-sm space-y-2 rounded-md border border-border bg-card p-3 text-left font-mono text-[11px] text-muted-foreground">
      <div className="flex items-center justify-between">
        <span className="opacity-70">{label ?? "debug"}</span>
        <button
          type="button"
          onClick={copyAll}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground active:scale-95"
        >
          {copied ? "Copied ✓" : "Copy logs"}
        </button>
      </div>
      <div className="space-y-0.5">
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
