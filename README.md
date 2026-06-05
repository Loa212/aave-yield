# Aave Yield

A Telegram Mini App that turns idle **USDT on TON** into **USD yield on Aave V3 (Base)** — without leaving Telegram, without seed phrases, on real mainnet.

> Built for the STON.fi Vibe Coding hackathon. This is what happens when you compose great primitives: STON.fi's cross-chain Omniston (HTLC-based atomic swaps between TON and EVM) + Aave V3 on Base (the deepest USD lending market on a cheap, fast chain) + Dynamic's Telegram auth (one-tap onboarding).

## What it does

1. **Sign in with Telegram** — Dynamic provisions a stable EVM EOA (Base) *and* a TON wallet from your Telegram identity. No seed phrase, no PIN. Sign in from any device, get the same wallet.
2. **See live Aave Base markets** — supply APYs for USDC and 8 other assets, read live from the Aave V3 Pool. USDC is interactive in v1.
3. **Deposit** — enter an amount of USDT-TON → STON.fi Omniston bridges it to USDC on Base via an HTLC atomic swap (~2–5 min) → the app supplies it to Aave → you earn yield (aUSDC).
4. **Withdraw** — the reverse: Aave withdraw → USDC on Base → Omniston HTLC back to USDT → arrives in your TON wallet.

All non-custodial in the way that matters: Dynamic holds the key, you control your Telegram identity, and you can export the EVM key and use Aave directly via MetaMask at any time.

## Architecture

```
Telegram identity (via Dynamic)
        │  provisions
        ├──────────────► EVM EOA (Base) ──supply──► Aave V3 Pool ──► aUSDC (yield)
        │                     ▲
        │                     │ USDC arrives
        └──────► TON wallet ──┴── STON.fi Omniston (HTLC) ──► USDC on Base
                  (USDT-TON)        two legs, each direction
```

- **Deposit leg:** sign a TON escrow transfer (HTLC) in the Dynamic TON wallet; the resolver locks USDC on Base; we disclose the HTLC secret to release it; then `pool.supply()`.
- **Withdraw leg:** `pool.withdraw()` on Base; sign an EIP-2612 permit on USDC (no separate approval tx) + the Omniston EIP-712 order; register it; the resolver locks USDT on TON; we disclose the secret.

## Stack

- **Bun** + **Vite** + **React 18** + **TypeScript**
- **TanStack Router** (file-based, HTML5 history — not hash mode, which breaks Telegram init-data) + **TanStack Query**
- **Tailwind v4** + **shadcn/ui** primitives (owned in `src/components/ui/`)
- **`@telegram-apps/sdk-react`** — theme, viewport, MainButton/BackButton, haptics
- **`@dynamic-labs/sdk-react-core`** + `@dynamic-labs/ethereum` + `@dynamic-labs/ton` — Telegram auth → EVM EOA + TON wallet
- **`@ston-fi/omniston-sdk`** + `-react` — cross-chain quotes, HTLC order payloads
- **`@bgd-labs/aave-address-book`** — Aave addresses; **viem v2** for signing/reads
- **Vercel** hosting

## Project layout

```
src/
  routes/         __root, index (home), sign-in, deposit, withdraw  (file-based)
  components/     balance-card, market-row, tx-progress, settings-sheet, toast, ui/
  hooks/          use-dynamic-wallet, use-aave-markets, use-usdc-supply-balance,
                  use-omniston-quote, use-deposit, use-withdraw, use-back-button
  lib/            aave (ABIs + supply/withdraw), omniston (assets + ChainAddress),
                  evm-order (EIP-2612 permit + order signing), htlc, telegram, utils
```

## Running locally

```bash
bun install
cp .env.example .env.local      # add your Dynamic environment ID
bun run dev                     # http://localhost:5174
bun run build                   # tsc --noEmit && vite build
```

### Lint, format, CI

```bash
bun run lint        # Biome check (lint + format + import order), no writes
bun run lint:fix    # apply Biome's safe fixes
bun run format      # format only
bun run ci          # what CI runs: lint → typecheck → build (run before pushing)
```

CI (`.github/workflows/ci.yml`) runs the same three steps as separate stages on
push/PR. Biome is configured (`biome.json`) to skip `.tmp`, `dist`, and the
generated `routeTree.gen.ts`.

Outside Telegram the app runs in a browser but Telegram-native auth/haptics no-op. See **[DEPLOY.md](DEPLOY.md)** for Vercel + Dynamic dashboard + BotFather setup.

## Notes & decisions

- **USDC permit:** native USDC on Base supports EIP-2612 (`version: "2"`, verified on-chain), so the withdraw leg uses a single permit signature instead of an approval tx — exactly as planned. Permit2 is the documented fallback (`src/lib/evm-order.ts`).
- **Aave reads:** we read `Pool.getReserveData(asset)` directly rather than the UI Pool Data Provider — the deployed Base UiPoolDataProvider's struct no longer decodes against the shipped address-book ABI (`src/lib/aave.ts` has the full note).
- **HTLC timing is honest:** the progress UI tells the user settlement takes minutes and that they can close the app — no fake-fast progress bar.

## Status

End-to-end code complete through polish. Real-device + real-money smoke tests on iPhone are the remaining gate before the Loom — see [LOOM.md](LOOM.md) for the recording script and the staged-test checklist.
