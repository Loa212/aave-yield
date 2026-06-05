// TEMP DEBUG: in-memory log + global error/network capture for the Telegram
// WebView (no console there). Rendered on-screen by the AuthGate debug panel.
// Remove this file + its imports before the Loom.

export interface DebugEntry {
  t: number; // ms since first import
  kind: "info" | "error" | "net";
  msg: string;
}

const t0 = Date.now();
const entries: DebugEntry[] = [];
const listeners = new Set<() => void>();

export function dbg(kind: DebugEntry["kind"], msg: string) {
  entries.push({ t: Date.now() - t0, kind, msg: msg.slice(0, 300) });
  for (const l of listeners) l();
}

export function getDebugEntries(): DebugEntry[] {
  return entries;
}

export function subscribeDebug(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let installed = false;

/** Install global error + fetch interceptors. Idempotent. Call once at boot. */
export function installDebugCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    dbg("error", `window.error: ${e.message}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    dbg(
      "error",
      `unhandledrejection: ${r instanceof Error ? `${r.name}: ${r.message}` : String(r)}`,
    );
  });

  // Wrap fetch to surface failing/slow Dynamic API calls.
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const url =
      typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
    const short = url.replace(/^https?:\/\//, "").slice(0, 60);
    const started = Date.now() - t0;
    try {
      const res = await origFetch(...args);
      // Only log non-2xx or Dynamic-related calls to avoid noise.
      if (!res.ok || /dynamic|dynamicauth/i.test(url)) {
        dbg("net", `${res.status} ${short} (+${Date.now() - t0 - started}ms)`);
        // For Dynamic 4xx, dump the response body — it carries the real reason
        // (e.g. "Invalid or expired OAuth state"). Clone so we don't consume it.
        if (res.status >= 400 && /dynamicauth/i.test(url)) {
          res
            .clone()
            .text()
            .then((body) => dbg("error", `body ${res.status}: ${body}`))
            .catch(() => undefined);
        }
      }
      return res;
    } catch (err) {
      dbg(
        "net",
        `FAILED ${short}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  };

  dbg("info", "debug capture installed");
}
