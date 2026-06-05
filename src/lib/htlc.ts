import type { OrderSettlementData } from "@ston-fi/omniston-sdk";
import { keccak256, sha256 } from "viem";

/** Generate a random 32-byte HTLC secret. */
export function generateHtlcSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Hash a secret into its hashlock using the function the quote specifies.
 * (Cribbed from the Omniston demo — the hashing function is resolver-chosen.)
 */
export function generateHtlcHashlock(
  secret: Uint8Array,
  hashingFunction: OrderSettlementData["htlcHashingFunction"],
): Uint8Array {
  // SecretModeProvided.hashes expects Uint8Array[] (32-byte hashes), so we
  // request the "bytes" output form from viem rather than a hex string.
  switch (hashingFunction) {
    case "HASHING_FUNCTION_KECCAK256":
      return keccak256(secret, "bytes");
    case "HASHING_FUNCTION_SHA256":
      return sha256(secret, "bytes");
    default:
      throw new Error(`Unsupported HTLC hashing function: ${hashingFunction}`);
  }
}
