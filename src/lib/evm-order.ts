import {
  type Address,
  encodeAbiParameters,
  hexToBytes,
  parseAbiParameters,
  parseSignature,
  serializeCompactSignature,
  signatureToCompactSignature,
  type WalletClient,
} from "viem";
import { base } from "viem/chains";
import { baseClient, ERC20_ABI, USDC_BASE } from "@/lib/aave";

/**
 * EIP-2612 permit for native USDC on Base.
 *
 * DECISION (plan §6 / rule 2c): The plan says "EIP-2612 permit on USDC to skip
 * approval tx". We verified on-chain that native USDC on Base
 * (0x833589fCD6…02913) exposes a working EIP-2612 permit — name "USD Coin",
 * version "2", live nonces()/DOMAIN_SEPARATOR. So a single off-chain signature
 * replaces the approval tx, exactly as the plan intends.
 *
 * NOTE: The Omniston demo instead routes this token through Permit2. That works
 * too, but costs a one-time on-chain Permit2 approval and a Permit2 nonce read.
 * If EIP-2612 ever regresses, fall back to Permit2 (PERMIT2_ADDRESS
 * 0x000000000022D473030F116dDEE9F6B43aC78BA3, "PermitSingle" typed data).
 */

const USDC_PERMIT_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: base.id,
  verifyingContract: USDC_BASE,
} as const;

const EIP2612_PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const EIP2612_PERMIT_PARAMETERS = parseAbiParameters(
  "address owner, address spender, uint256 value, uint256 nonce, uint256 deadline",
);

export interface SignedPermit {
  /** Raw 65-byte signature for evmBuildOrderPayload.permitSignature. */
  permitSignature: Uint8Array;
  /** ABI-encoded permit fields for evmBuildOrderPayload.encodedPermitData. */
  encodedPermitData: Uint8Array;
}

/**
 * Sign an EIP-2612 permit authorizing `spender` to pull `value` USDC from
 * `owner`. Reads the live nonce; deadline is +1h.
 */
export async function signUsdcPermit(
  walletClient: WalletClient,
  owner: Address,
  spender: Address,
  value: bigint,
): Promise<SignedPermit> {
  const nonce = await baseClient.readContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: "nonces",
    args: [owner],
  });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const message = { owner, spender, value, nonce, deadline };

  const signature = await walletClient.signTypedData({
    account: owner,
    domain: USDC_PERMIT_DOMAIN,
    types: EIP2612_PERMIT_TYPES,
    primaryType: "Permit",
    message,
  });

  return {
    permitSignature: hexToBytes(signature),
    encodedPermitData: hexToBytes(
      encodeAbiParameters(EIP2612_PERMIT_PARAMETERS, [
        owner,
        spender,
        value,
        nonce,
        deadline,
      ]),
    ),
  };
}

// --- Order typed-data signing + encoding (for orderRegisterSignedOrder) ---

interface OrderTypedData {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

/** Sign the Omniston EVM order EIP-712 payload with Dynamic's wallet. */
export async function signOrderTypedData(
  walletClient: WalletClient,
  owner: Address,
  typedDataJson: string,
): Promise<{ typedData: OrderTypedData; signature: `0x${string}` }> {
  const typedData = JSON.parse(typedDataJson) as OrderTypedData;
  const signature = await walletClient.signTypedData({
    account: owner,
    // The payload is self-describing EIP-712; pass it through verbatim.
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  } as Parameters<WalletClient["signTypedData"]>[0]);
  return { typedData, signature };
}

/** ABI-encode the order struct (primaryType) from its typed-data message. */
export function encodeOrder(typedData: OrderTypedData): Uint8Array {
  const fields = typedData.types[typedData.primaryType];
  return hexToBytes(
    encodeAbiParameters(
      fields,
      fields.map((f) => typedData.message[f.name]),
    ),
  );
}

/** Convert a 65-byte signature to the compact (EIP-2098) byte form the SDK wants. */
export function encodeCompactSignature(signature: `0x${string}`): Uint8Array {
  const parsed = parseSignature(signature);
  const compact = signatureToCompactSignature(parsed);
  return hexToBytes(serializeCompactSignature(compact));
}
