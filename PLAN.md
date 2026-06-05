# aave-yield — plan

A Telegram Mini App. User has USDT on TON. App bridges it to USDC on Base via STON.fi Omniston cross-chain, supplies to Aave Base. User earns yield. Withdraw is the reverse.

Ship tonight. Hackathon submission to STON.fi Vibe Coding by June 8 08:00 UTC.

## End goal

A user opens `@aave_yield_bot` in Telegram on their phone. They:

1. Tap "Sign in" — Dynamic creates/restores their EVM wallet automatically via Telegram auth
2. See Aave Base's market list with live APYs (USDC, USDbC, WETH, cbETH, …) — only USDC is interactive in v1
3. Deposit 5 USDT-TON → STON.fi Omniston HTLC swap (~3 min) → USDC arrives on Base → app supplies to Aave → user sees "$X.XX earning Y% APY"
4. Withdraw → Aave withdraw → STON.fi Omniston back (~3 min) → USDT arrives in TON wallet

End-to-end on real mainnet with real money. Recorded in a 5-min Loom.

Cross-device works seamlessly — sign in from a new phone, Dynamic serves the same EVM EOA, funds are immediately accessible.

## Architecture

```
Telegram identity (via Dynamic) → stable EVM EOA (held by Dynamic)
                                              │
                                              │ owns
                                              ▼
                                       User's Base EOA
                                              │
                                              │ holds (transiently)
                                              ▼
                                          USDC (native)
                                              │
                                              │ supplied to
                                              ▼
                                    Aave V3 Base Pool
                                       (returns aUSDC)
```

Cross-chain: USDT-TON ↔ USDC-Base via STON.fi Omniston (HTLC-based atomic swaps). Two legs each direction. EVM-side is a vanilla EOA — no Safe, no deposit wallet, no contract account.

## Why this submission wins

- **On-thesis for STON.fi's crosschain launch.** Their workshop slide #2 was literally "deposit USDC on Polygon, strategy allocates yield" — we're doing the same on Base.
- **Real product, real money, no fork demos.** Mainnet end-to-end.
- **Doesn't compete with STON.fi's roadmap.** STON.fi Farm is TON-side LP; this is EVM-side lending. Complementary.
- **Hackathon manager (@cupcake_atarian) suggested staking as the right direction.** Taking the hint.
- **Seamless onboarding via Dynamic** (per Pavel's recommendation, what STON.fi's own demo uses).

## Stack

- **Bun** + **Vite** + **React 18** + **TypeScript**
- **TanStack Router** — file-based routing ONLY (no code-based route definitions), HTML5 history mode (explicitly NOT hash mode, since hash routing breaks Telegram init-data delivery). Use the Vite plugin (`@tanstack/router-plugin/vite`) to auto-generate `routeTree.gen.ts` from the `src/routes/` directory.
- **TanStack Query** (`@tanstack/react-query`)
- **Tailwind CSS** for styling (v4 if shadcn supports it cleanly, v3 as fallback)
- **shadcn/ui** for component primitives — Radix-based, Tailwind-styled, copy components into the repo so we own them; mix with custom components freely
- **TanStack Router's typed search params** for URL state (no separate state lib needed)
- `@telegram-apps/sdk-react` for Telegram-native primitives only (theme detection, viewport, MainButton, BackButton, haptics) — NOT for layout or styling
- `@dynamic-labs/sdk-react-core` + `@dynamic-labs/ethereum` — Telegram auth → stable EVM EOA
- `@ston-fi/omniston-sdk` + `@ston-fi/omniston-sdk-react` — cross-chain quotes, HTLC order payloads
- `@bgd-labs/aave-address-book` — Aave contract addresses per chain
- **viem v2** for EVM signing & RPC reads
- **Vercel** for hosting

**Dropped from earlier plans (no longer needed with Dynamic):**

- keystore.ts (Argon2id PIN encryption)
- passkey.ts (WebAuthn PRF biometric)
- useDerivedAccount.ts (PIN-unlock flow)
- SetupPage / UnlockPage
- TON Connect (Dynamic handles Telegram auth, including TON-side identity)

## File structure (TanStack Router conventions)

```
src/
  routes/
    __root.tsx              # Providers: Dynamic, TanStack Query, telegram theme, router devtools
    index.tsx               # HomePage — Aave market list + USDC balance card
    sign-in.tsx             # Dynamic Telegram auth (only shown if not authenticated)
    deposit.tsx             # USDT-TON → USDC on Base → Aave supply
    withdraw.tsx             # Aave withdraw → USDC on Base → USDT-TON
  components/
    ui/                     # shadcn-generated components (button, card, dialog, input, etc.)
    balance-card.tsx        # "Your USDC on Aave: $X earning Y% APY"
    market-row.tsx          # one Aave market row — symbol, APY, interactive or "Coming soon"
    tx-progress.tsx         # multi-stage progress for cross-chain HTLC bridges
    settings-sheet.tsx      # EOA address, sign out, link to Dynamic dashboard
  hooks/
    use-dynamic-wallet.ts   # wraps Dynamic SDK — returns { evmAddress, signer, isAuthenticated }
    use-aave-markets.ts     # fetches all Base markets + live APYs via UI Pool Data Provider
    use-usdc-supply-balance.ts  # reads aUSDC balance (= USDC + accrued yield)
    use-omniston-quote.ts   # cross-chain quote, source TON ↔ destination Base
    use-deposit.ts          # USDT-TON → USDC via Omniston → aavePool.supply
    use-withdraw.ts         # aavePool.withdraw → USDC → USDT-TON via Omniston
  lib/
    aave.ts                 # ABIs + calldata helpers; addresses from @bgd-labs/aave-address-book
    omniston.ts             # SDK wrappers, asset-ID helpers (slug-based, not chain_id)
    telegram.ts             # tma-sdk init, MainButton, haptics
    utils.ts                # cn() helper for shadcn, formatters
  types/
    aave.ts
    omniston.ts
```

## What's in scope for tonight

- Dynamic Telegram auth → stable EOA (sign-in route)
- Home: Aave Base market list with live APYs + user's USDC balance card
- Deposit: USDT-TON → STON.fi Omniston (HTLC, ~3min) → USDC arrives on user's Base EOA → Aave supply
- Withdraw: Aave withdraw → USDC on Base → STON.fi Omniston (HTLC, ~3min) → USDT-TON
- BotFather Mini App configured for `@aave_yield_bot`
- Vercel deploy with custom domain (or `.vercel.app` for v1 if domain prep slips)
- 5-min Loom recording end-to-end on real iPhone

## Hard cuts — NOT building

- Multi-asset deposit (USDbC, WETH, cbETH) — display-only, defer
- Multi-chain (Polygon, Arbitrum, Ethereum) — Base only
- Borrow / leveraged yield loop
- Auto-compound — Aave's aUSDC accrues yield natively
- Referral codes, notifications, social features
- "Sign out and recover from external wallet" flow — Dynamic handles transparently
- Custom app fees / revenue capture

## Critical constants

```ts
// lib/aave.ts
import { AaveV3Base } from "@bgd-labs/aave-address-book";

export const AAVE_BASE_POOL = AaveV3Base.POOL;
export const USDC_BASE = AaveV3Base.ASSETS.USDC.UNDERLYING;
//   → '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' (native USDC on Base)
export const AUSDC_BASE = AaveV3Base.ASSETS.USDC.A_TOKEN;
export const UI_POOL_DATA_PROVIDER = AaveV3Base.UI_POOL_DATA_PROVIDER;

// lib/omniston.ts
export const USDT_TON_JETTON =
  "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

// Omniston AssetId shape — slug-based, NOT numeric chain_id:
export const ASSET_USDC_BASE = {
  chain: {
    $case: "base",
    value: { kind: { $case: "erc20", value: USDC_BASE } },
  },
} as const;

export const ASSET_USDT_TON = {
  chain: {
    $case: "ton",
    value: { kind: { $case: "jetton", value: USDT_TON_JETTON } },
  },
} as const;
```

## Settlement model — important

**STON.fi cross-chain on EVM is HTLC-only, no instant swap.** This means:

- Quote arrives via `requestForQuote` observable (`quoteUpdated` event)
- Build order payload via `evmBuildOrderPayload` (with optional EIP-2612/Permit2 permit to skip the approval tx)
- Sign EIP-712 order with viem (from Dynamic's serving wallet)
- Submit via `orderRegisterSignedOrder`
- HTLC settlement takes a few minutes (not seconds) — design the progress UI to reflect this honestly

**For deposit (TON-side signing):**

- Build via `tonBuildEscrowTransfer` (HTLC), sign via Dynamic's TON path

Don't try to compress the bridge in the Loom recording. Show the user the realistic experience — "your funds arrive in 2-3 minutes, you can close the app, we'll show you when it's done."

## Reference code (in `.tmp/`, gitignored)

- `polygram-markets/` — your previous Polygram code. Useful for: Telegram SDK init, viem patterns, Vercel function shape, BrowserRouter setup. **Don't copy raw CSS or React Router code — we're on Tailwind/shadcn/TanStack now.**
- `interface/` — Aave's official UI. Useful for: how to call `pool.supply()` correctly, aToken balance reading patterns.
- `omniston-sdk/` — STON.fi SDK monorepo (`examples/react-app/` is the demo). Useful for: how to call `requestForQuote`, how to handle the observable stream, how to build & sign HTLC orders, how to use EIP-2612/Permit2 permits.
- `reactjs-template/` — canonical Telegram Mini App starter. Reference only; we're using our own stack.

Skim for patterns, don't copy wholesale. The omniston-sdk demo is the most important reference; it's the canonical cross-chain integration.

## Build order (real-device checked at each milestone)

1. **Scaffold + deploy.** Bun + Vite + React + TS. Install all deps. Tailwind set up. shadcn CLI initialized with base components (Button, Card, Dialog, Input, Sheet). TanStack Router with HTML5 history mode + skeleton routes. Single placeholder route renders. Vercel deploy. BotFather Mini App config points at Vercel URL.

2. **iPhone launch check.** Open `@aave_yield_bot` on real iPhone. Force-close Telegram, re-open, tap launch. Mini App must load without "Storage Unavailable" or init-data errors. If broken, fix here — the Polygram launch issue could repeat. Probably already fixed by HTML5 history mode.

3. **Dynamic Telegram auth.** Wire `DynamicContextProvider` in `__root.tsx`. Sign-in route does the Telegram auth ceremony. After auth, `useDynamicWallet` returns an EVM address. Verify the address on Basescan (should be a fresh EOA with 0 balance). Verify cross-device: sign in on macOS, then on iPhone — same EVM address.

4. **Home page with Aave market list.** Read-only. Fetch from UI Pool Data Provider, show all Base markets with their supply APYs, only USDC is highlighted as interactive. User's USDC balance card shows $0.00 initially. No actions yet.

5. **Deposit flow.** Click into USDC → DepositPage. User enters amount in USDT (slider or input). Omniston quote arrives. User taps Confirm. TON-side signing happens via Dynamic. HTLC progress UI shows: "Bridging from TON" → "Settling on Base" → "Supplying to Aave" → "Done." Real money smoke test with $2-3 USDT-TON. Verify USDC arrives, supply lands as aUSDC, balance card updates.

6. **Withdraw flow.** WithdrawPage. User enters USD amount. Aave withdraw fires first (small permit signature for aUSDC + the withdraw call). USDC sits on EOA briefly. Omniston quote for USDC→USDT-TON. EIP-2612 permit on USDC to skip approval tx. HTLC progress UI. Real money smoke test — verify USDT arrives in TON wallet.

7. **Polish.** TxProgress UI nicely styled, haptics on success/error, empty states, error toasts. Settings sheet (show EOA, sign out, "powered by Dynamic + STON.fi + Aave" credits).

8. **Loom + submit.** Real-device recording on iPhone. Deposit → trade → withdraw flow end-to-end. 5 minutes max. README. GitHub repo cleanup. Submit before June 8 08:00 UTC.

## Risks to watch tonight

- **Dynamic's TON auth inside Telegram WebView.** Their docs say "works out of the box" — verify on real iPhone after step 1. If broken, fall back to TON Connect + local keystore (Polygram-era approach, code in `.tmp/polygram-markets/` to crib).
- **Tailwind v4 + shadcn compatibility.** shadcn officially supports v4 as of late 2024 but ecosystem lag is real. If friction, drop to v3 — costs nothing in functionality.
- **TanStack Router file-based routing + Vercel.** Vercel handles SPA fallback by default but check it works for nested routes after first deploy.
- **HTLC settlement timing variability.** Could be 2 min, could be 10 min depending on resolver. Surface "estimated 3-5 min" in UI, refresh status optimistically.
- **iPhone launch issue from Polygram.** Likely already fixed by HTML5 history mode (TanStack Router default). Verify in step 2.

## Definition of done

I can hand my iPhone to a stranger and they can:

- Open `@aave_yield_bot` in Telegram
- Tap "Sign in with Telegram" → Dynamic creates their wallet seamlessly
- Deposit 5 USDT-TON, wait ~3 min, see USDC earning yield on Aave Base
- Withdraw, wait ~3 min, see USDT-TON arrive back in their TON wallet
- All on real mainnet, with real money
- The Loom shows this happening end-to-end in under 5 minutes

That's the bar.

## Bonus framing for Loom / README

"This is what happens when you compose great primitives: STON.fi's cross-chain Omniston (HTLC-based atomic swaps between TON and EVM chains) + Aave V3 on Base (deepest USD lending market on a cheap, fast chain) + Dynamic's Telegram auth (one-tap onboarding, no seed phrases, no PIN setup). Users get USD yield on their USDT-TON without leaving Telegram. The whole stack is non-custodial in the sense that matters — Dynamic holds the key, but the user controls their Telegram identity, and at any point they can export their EVM key and interact with Aave directly via MetaMask."
