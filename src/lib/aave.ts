import { AaveV3Base } from "@bgd-labs/aave-address-book";
import {
  createPublicClient,
  fallback,
  http,
  type Address,
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
