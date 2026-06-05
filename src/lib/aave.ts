import { AaveV3Base } from "@bgd-labs/aave-address-book";
import {
  createPublicClient,
  fallback,
  http,
  maxUint256,
  type Address,
  type WalletClient,
  parseAbi,
} from "viem";
import { base } from "viem/chains";

// --- Addresses (from @bgd-labs/aave-address-book, the canonical source) ---
export const AAVE_BASE_POOL = AaveV3Base.POOL as Address;
export const USDC_BASE = AaveV3Base.ASSETS.USDC.UNDERLYING as Address;
//   → 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (native USDC on Base)
export const AUSDC_BASE = AaveV3Base.ASSETS.USDC.A_TOKEN as Address;
export const USDC_DECIMALS = AaveV3Base.ASSETS.USDC.decimals; // 6
export const UI_POOL_DATA_PROVIDER =
  AaveV3Base.UI_POOL_DATA_PROVIDER as Address;
export const POOL_ADDRESSES_PROVIDER =
  AaveV3Base.POOL_ADDRESSES_PROVIDER as Address;

// RAY = 1e27, Aave's fixed-point precision for rates/indexes.
export const RAY = 10n ** 27n;
export const SECONDS_PER_YEAR = 31_536_000;

// --- Public client for Base reads. Fallback transport survives RPC outages. ---
export const baseClient = createPublicClient({
  chain: base,
  transport: fallback([
    http("https://mainnet.base.org"),
    http("https://base.publicnode.com"),
    http("https://base.drpc.org"),
    http("https://1rpc.io/base"),
  ]),
});

// --- ABIs (minimal fragments — we own these, no contract-helpers dependency) ---
export const POOL_ABI = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
  "function supplyWithPermit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode, uint256 deadline, uint8 permitV, bytes32 permitR, bytes32 permitS)",
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
]);

export const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function version() view returns (string)",
]);

/**
 * Pool.getReserveData(asset) → ReserveData.
 *
 * NOTE: We deliberately do NOT use the UI Pool Data Provider's getReservesData.
 * The deployed UiPoolDataProvider on Base returns an AggregatedReserveData
 * struct whose layout no longer matches the ABI shipped in the current
 * @bgd-labs/aave-address-book — viem fails to decode it (a bool field lands on
 * non-bool bytes). The Pool's ReserveData struct is part of the core protocol
 * and its layout is stable; reading it per-asset decodes cleanly. Verified live
 * against Base mainnet: USDC ~3.3% APY, aToken matches the address book.
 *
 * currentLiquidityRate is the supply APR in RAY; convert via apyFromLiquidityRate.
 */
export const RESERVE_DATA_ABI = parseAbi([
  "struct ReserveConfigurationMap { uint256 data }",
  "struct ReserveData { ReserveConfigurationMap configuration; uint128 liquidityIndex; uint128 currentLiquidityRate; uint128 variableBorrowIndex; uint128 currentVariableBorrowRate; uint128 currentStableBorrowRate; uint40 lastUpdateTimestamp; uint16 id; address aTokenAddress; address stableDebtTokenAddress; address variableDebtTokenAddress; address interestRateStrategyAddress; uint128 accruedToTreasury; uint128 unbacked; uint128 isolationModeTotalDebt }",
  "function getReserveData(address asset) view returns (ReserveData)",
]);

/** Aave V3 Base markets we surface in the list. Only USDC is interactive in v1. */
export interface AaveAsset {
  symbol: string;
  underlying: Address;
  aToken: Address;
  decimals: number;
  interactive: boolean;
}

export const BASE_ASSETS: AaveAsset[] = (
  [
    "USDC",
    "USDbC",
    "WETH",
    "cbETH",
    "wstETH",
    "cbBTC",
    "EURC",
    "GHO",
    "AAVE",
  ] as const
).flatMap((sym) => {
  const a = AaveV3Base.ASSETS[sym];
  if (!a) return [];
  return [
    {
      symbol: sym,
      underlying: a.UNDERLYING as Address,
      aToken: a.A_TOKEN as Address,
      decimals: a.decimals,
      interactive: sym === "USDC",
    },
  ];
});

/**
 * Convert Aave's RAY-scaled liquidityRate (per-second APR) into a compounded APY.
 *
 * Aave stores liquidityRate as an APR in RAY units. The APY accounting for
 * per-second compounding is:
 *   apy = (1 + ratePerSecond) ^ secondsPerYear - 1
 * where ratePerSecond = liquidityRate / RAY / secondsPerYear.
 *
 * This matches @aave/math-utils' RAY_DECIMALS / rayPow approach.
 */
export function apyFromLiquidityRate(liquidityRate: bigint): number {
  const ratePerSecond =
    Number(liquidityRate) / Number(RAY) / SECONDS_PER_YEAR;
  return (1 + ratePerSecond) ** SECONDS_PER_YEAR - 1;
}

// --- Write helpers (take Dynamic's viem WalletClient on Base) ---

/** Read the raw USDC balance of an address (base units). */
export async function readUsdcBalance(owner: Address): Promise<bigint> {
  return baseClient.readContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner],
  });
}

/**
 * Approve USDC for the Aave Pool if the current allowance is below `amount`,
 * then supply `amount` USDC to Aave on behalf of `owner`. Returns the supply
 * tx hash.
 *
 * ASSUMPTION: We approve max uint256 once so repeat deposits skip the approval
 * tx. Standard practice for a Pool you interact with repeatedly; the user can
 * always revoke. supplyWithPermit would avoid the separate approval entirely,
 * but the deposit leg's USDC arrives fresh on the EOA so a one-time max approve
 * is the simpler, more reliable path here (permit is used on the WITHDRAW leg
 * where we sign for the Omniston order anyway).
 */
export async function approveAndSupply(
  walletClient: WalletClient,
  owner: Address,
  amount: bigint,
): Promise<`0x${string}`> {
  const allowance = await baseClient.readContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, AAVE_BASE_POOL],
  });

  if (allowance < amount) {
    const approveHash = await walletClient.writeContract({
      account: owner,
      chain: base,
      address: USDC_BASE,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [AAVE_BASE_POOL, maxUint256],
    });
    await baseClient.waitForTransactionReceipt({ hash: approveHash });
  }

  const supplyHash = await walletClient.writeContract({
    account: owner,
    chain: base,
    address: AAVE_BASE_POOL,
    abi: POOL_ABI,
    functionName: "supply",
    args: [USDC_BASE, amount, owner, 0],
  });
  await baseClient.waitForTransactionReceipt({ hash: supplyHash });
  return supplyHash;
}

/** Withdraw `amount` USDC (base units) from Aave to `owner`. */
export async function withdrawFromAave(
  walletClient: WalletClient,
  owner: Address,
  amount: bigint,
): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({
    account: owner,
    chain: base,
    address: AAVE_BASE_POOL,
    abi: POOL_ABI,
    functionName: "withdraw",
    args: [USDC_BASE, amount, owner],
  });
  await baseClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Poll until the EOA's USDC balance grows by at least `minDelta` over the
 * starting balance (i.e. the bridged USDC landed), or until timeout. Returns
 * the delta that arrived.
 */
export async function waitForUsdcArrival(
  owner: Address,
  startBalance: bigint,
  minDelta: bigint,
  { timeoutMs = 15 * 60_000, intervalMs = 5_000 } = {},
): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const current = await readUsdcBalance(owner);
    const delta = current - startBalance;
    if (delta >= minDelta) return delta;
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for bridged USDC to arrive on Base");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
