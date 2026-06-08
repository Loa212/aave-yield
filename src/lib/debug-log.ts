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

/** Probe whether storage APIs Dynamic's keychain needs actually work here. */
async function probeStorage() {
  // localStorage
  try {
    window.localStorage.setItem("__probe", "1");
    window.localStorage.removeItem("__probe");
    dbg("info", "localStorage: OK");
  } catch (e) {
    dbg(
      "error",
      `localStorage: BLOCKED ${e instanceof Error ? e.message : ""}`,
    );
  }
  // IndexedDB (Dynamic's session keychain lives here)
  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("__probe_db", 1);
      req.onsuccess = () => {
        req.result.close();
        indexedDB.deleteDatabase("__probe_db");
        resolve();
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("blocked"));
    });
    dbg("info", "indexedDB: OK");
  } catch (e) {
    dbg("error", `indexedDB: BLOCKED ${e instanceof Error ? e.message : ""}`);
  }
  // crypto.subtle (keypair generation)
  dbg(
    "info",
    `crypto.subtle: ${typeof crypto !== "undefined" && crypto.subtle ? "present" : "MISSING"}`,
  );
}

/** Install global error + fetch interceptors. Idempotent. Call once at boot. */
export function installDebugCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  void probeStorage();

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
    // args[0] may be a string, a URL object, OR a Request. The TonConnect SDK's
    // bridge POST calls fetch(new URL(...), init) — a URL object — so we MUST
    // handle that case. (A prior version assumed string|Request and did
    // (args[0] as Request).url on a URL object → undefined → "url.slice" threw
    // INSIDE this wrapper, so the real bridge fetch never ran and the SDK
    // retried forever: the entire 40s send hang was THIS bug, not the WebView.)
    const input = args[0];
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : String(input);
    // Show the path tail (the endpoint), not the truncated host — we need to see
    // WHICH dynamic endpoints run before /telegram/signin.
    const short = (() => {
      try {
        const u = new URL(url);
        return `${u.host.split(".")[0]}…${u.pathname.replace(/\/sdk\/[0-9a-f-]+/, "/sdk/…")}`;
      } catch {
        return url.slice(0, 60);
      }
    })();
    const method =
      (args[1] as RequestInit | undefined)?.method ??
      (input instanceof Request ? input.method : "GET");
    // For the telegram signin call, log which fields we send (esp. whether
    // sessionPublicKey/code are present — the OpenAPI marks them required).
    if (/telegram\/signin/i.test(url)) {
      try {
        const rawBody = (args[1] as RequestInit | undefined)?.body;
        if (typeof rawBody === "string") {
          const b = JSON.parse(rawBody) as Record<string, unknown>;
          dbg(
            "info",
            `signin body keys: ${Object.keys(b).join(",")} | sessionPublicKey=${
              b.sessionPublicKey ? "set" : "EMPTY"
            } code=${b.code ? "set" : "EMPTY"} state=${
              b.state ? "set" : "EMPTY"
            }`,
          );
        }
      } catch {
        /* ignore */
      }
    }
    const started = Date.now() - t0;
    try {
      const res = await origFetch(...args);
      // Only log non-2xx or Dynamic-related calls to avoid noise — PLUS all
      // TonConnect bridge traffic (walletbot.me / tonapi) so we can see whether
      // the send POST actually completes.
      if (!res.ok || /dynamic|dynamicauth|walletbot|tonapi|bridge/i.test(url)) {
        dbg(
          "net",
          `${method} ${res.status} ${short} (+${Date.now() - t0 - started}ms)`,
        );
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
