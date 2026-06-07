import { useQuery } from "@tanstack/react-query";
import { USDT_TON_JETTON } from "@/lib/omniston";

// TON Center v3 public API (no key needed for light read traffic; rate-limited).
const TONCENTER = "https://toncenter.com/api/v3";

export interface TonBalances {
  /** Native TON, human units. */
  ton: number;
  /** USDT (jetton) on TON, human units (6 decimals). */
  usdt: number;
}

async function fetchNativeTon(address: string): Promise<number> {
  const res = await fetch(
    `${TONCENTER}/account?address=${encodeURIComponent(address)}`,
  );
  if (!res.ok) return 0;
  const json = (await res.json()) as { balance?: string };
  // balance is in nanotons (9 decimals).
  return json.balance ? Number(json.balance) / 1e9 : 0;
}

async function fetchUsdtJetton(address: string): Promise<number> {
  // Find the owner's jetton wallet for the USDT master, read its balance.
  const url =
    `${TONCENTER}/jetton/wallets?owner_address=${encodeURIComponent(address)}` +
    `&jetton_address=${encodeURIComponent(USDT_TON_JETTON)}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return 0;
  const json = (await res.json()) as {
    jetton_wallets?: { balance?: string }[];
  };
  const raw = json.jetton_wallets?.[0]?.balance;
  // USDT on TON has 6 decimals.
  return raw ? Number(raw) / 1e6 : 0;
}

/** Live TON + USDT-TON balances for the connected TON wallet. */
export function useTonBalances(tonAddress: string | undefined) {
  return useQuery({
    queryKey: ["ton-balances", tonAddress],
    enabled: Boolean(tonAddress),
    queryFn: async (): Promise<TonBalances> => {
      const addr = tonAddress as string;
      const [ton, usdt] = await Promise.all([
        fetchNativeTon(addr).catch(() => 0),
        fetchUsdtJetton(addr).catch(() => 0),
      ]);
      return { ton, usdt };
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}
