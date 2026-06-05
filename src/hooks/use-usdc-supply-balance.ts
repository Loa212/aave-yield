import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import {
  AUSDC_BASE,
  USDC_BASE,
  USDC_DECIMALS,
  AAVE_BASE_POOL,
  ERC20_ABI,
  RESERVE_DATA_ABI,
  apyFromLiquidityRate,
  baseClient,
} from "@/lib/aave";

export interface UsdcSupplyBalance {
  /** aUSDC balance (principal + accrued yield), as a number of USDC. */
  supplied: number;
  /** Raw idle USDC sitting on the EOA (transient, mid-bridge), as USDC. */
  walletUsdc: number;
  /** Current USDC supply APY (decimal). */
  apy: number;
  /** Raw aUSDC balance in base units (for max-withdraw math). */
  suppliedRaw: bigint;
}

/**
 * Read the user's Aave USDC position.
 *
 * aUSDC is a rebasing aToken: balanceOf() already reflects principal + accrued
 * interest, so no separate yield calc is needed. We also read idle USDC on the
 * EOA (briefly non-zero while a bridge leg settles) and the live USDC APY.
 */
export function useUsdcSupplyBalance(address: Address | undefined) {
  return useQuery({
    queryKey: ["usdc-supply-balance", address],
    enabled: Boolean(address),
    queryFn: async (): Promise<UsdcSupplyBalance> => {
      const owner = address!;
      const [aBal, wBal, reserve] = await baseClient.multicall({
        contracts: [
          {
            address: AUSDC_BASE,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [owner],
          },
          {
            address: USDC_BASE,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [owner],
          },
          {
            address: AAVE_BASE_POOL,
            abi: RESERVE_DATA_ABI,
            functionName: "getReserveData",
            args: [USDC_BASE],
          },
        ],
        allowFailure: true,
      });

      const suppliedRaw = aBal.status === "success" ? aBal.result : 0n;
      const walletRaw = wBal.status === "success" ? wBal.result : 0n;
      const apy =
        reserve.status === "success"
          ? apyFromLiquidityRate(reserve.result.currentLiquidityRate)
          : 0;

      return {
        supplied: Number(formatUnits(suppliedRaw, USDC_DECIMALS)),
        walletUsdc: Number(formatUnits(walletRaw, USDC_DECIMALS)),
        apy,
        suppliedRaw,
      };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
