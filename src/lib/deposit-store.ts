// Durable store for in-flight deposits.
//
// WHY: the HTLC secret is the ONLY key to funds locked in the TON escrow. If it
// lives only in memory and the tab closes / the SDK errors / the app crashes
// between funding the escrow and disclosing the secret, the funds are stranded
// (and if we never disclose, only the on-chain timelock refund recovers them).
// We persist the secret + order context to localStorage BEFORE funding the
// escrow, so a reload can resume tracking + disclosure (or at least surface the
// pending order for recovery).

const KEY = "aave-yield:pending-deposits:v1";

export interface PendingDeposit {
  /** Omniston quote/order id. */
  quoteId: string;
  /** HTLC secrets, hex-encoded (one per execution chunk). */
  secretsHex: string[];
  /** The trader's TON address (refund destination + orderTrack key). */
  traderTonAddress: string;
  /** The EVM address USDC is bridged to. */
  evmAddress: string;
  /** Quoted output (USDC base units) — for the arrival check on resume. */
  quotedOutputUnits: string;
  /** When we created this record (ms). Used to age out stale entries. */
  createdAt: number;
}

function read(): PendingDeposit[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PendingDeposit[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items: PendingDeposit[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Save a pending deposit (call BEFORE funding the escrow). */
export function savePendingDeposit(d: PendingDeposit): void {
  const items = read().filter((x) => x.quoteId !== d.quoteId);
  items.push(d);
  write(items);
}

/** Remove a deposit once it's settled (or abandoned). */
export function clearPendingDeposit(quoteId: string): void {
  write(read().filter((x) => x.quoteId !== quoteId));
}

/** All pending deposits, newest first. */
export function getPendingDeposits(): PendingDeposit[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}
