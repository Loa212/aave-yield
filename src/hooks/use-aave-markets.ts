import { useQuery } from "@tanstack/react-query";
import {
  BASE_ASSETS,
  AAVE_BASE_POOL,
  RESERVE_DATA_ABI,
  apyFromLiquidityRate,
  baseClient,
  type AaveAsset,
} from "@/lib/aave";

export interface AaveMarket extends AaveAsset {
  /** Supply APY as a decimal (0.033 = 3.3%). */
  supplyApy: number;
}

/**
 * Fetch live supply APYs for all displayed Base markets.
 *
 * One multicall to Pool.getReserveData per asset. We read currentLiquidityRate
 * (RAY) and compound it to an APY. USDC is sorted first since it's the only
 * interactive market in v1.
 */
export function useAaveMarkets() {
  return useQuery({
    queryKey: ["aave-markets"],
    queryFn: async (): Promise<AaveMarket[]> => {
      const results = await baseClient.multicall({
        contracts: BASE_ASSETS.map((asset) => ({
          address: AAVE_BASE_POOL,
          abi: RESERVE_DATA_ABI,
          functionName: "getReserveData" as const,
          args: [asset.underlying] as const,
        })),
        allowFailure: true,
      });

      const markets = BASE_ASSETS.map((asset, i) => {
        const r = results[i];
        const supplyApy =
          r.status === "success"
            ? apyFromLiquidityRate(r.result.currentLiquidityRate)
            : 0;
        return { ...asset, supplyApy };
      });

      // USDC first, then by APY desc.
      return markets.sort((a, b) => {
        if (a.interactive !== b.interactive) return a.interactive ? -1 : 1;
        return b.supplyApy - a.supplyApy;
      });
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
