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
 * UI Pool Data Provider: getReservesData(provider) returns
 * [aggregatedReserveData[], baseCurrencyInfo].
 * We only read the per-reserve fields we display. liquidityRate is a RAY-scaled
 * per-second-ish APR (see apyFromLiquidityRate for the conversion).
 */
export const UI_POOL_DATA_PROVIDER_ABI = parseAbi([
  "struct AggregatedReserveData { address underlyingAsset; string name; string symbol; uint256 decimals; uint256 baseLTVasCollateral; uint256 reserveLiquidationThreshold; uint256 reserveLiquidationBonus; uint256 reserveFactor; bool usageAsCollateralEnabled; bool borrowingEnabled; bool stableBorrowRateEnabled; bool isActive; bool isFrozen; uint128 liquidityIndex; uint128 variableBorrowIndex; uint128 liquidityRate; uint128 variableBorrowRate; uint128 stableBorrowRate; uint40 lastUpdateTimestamp; address aTokenAddress; address stableDebtTokenAddress; address variableDebtTokenAddress; address interestRateStrategyAddress; uint256 availableLiquidity; uint256 totalPrincipalStableDebt; uint256 averageStableRate; uint256 stableDebtLastUpdateTimestamp; uint256 totalScaledVariableDebt; uint256 priceInMarketReferenceCurrency; address priceOracle; uint256 variableRateSlope1; uint256 variableRateSlope2; uint256 stableRateSlope1; uint256 stableRateSlope2; uint256 baseStableBorrowRate; uint256 baseVariableBorrowRate; uint256 optimalUsageRatio; bool isPaused; bool isSiloedBorrowing; uint128 accruedToTreasury; uint128 unbacked; uint128 isolationModeTotalDebt; bool flashLoanEnabled; uint256 debtCeiling; uint256 debtCeilingDecimals; uint8 eModeCategoryId; uint256 borrowCap; uint256 supplyCap; uint8 eModeLtv; uint8 eModeLiquidationThreshold; uint8 eModeLiquidationBonus; address eModePriceSource; string eModeLabel; bool borrowableInIsolation; uint128 virtualUnderlyingBalance }",
  "struct BaseCurrencyInfo { uint256 marketReferenceCurrencyUnit; int256 marketReferenceCurrencyPriceInUsd; int256 networkBaseTokenPriceInUsd; uint8 networkBaseTokenPriceDecimals }",
  "function getReservesData(address provider) view returns (AggregatedReserveData[], BaseCurrencyInfo)",
]);

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
