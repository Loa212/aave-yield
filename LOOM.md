# Loom recording — script & pre-flight

Target: **5 minutes max**, real iPhone, real money, end-to-end. Record AFTER the
pre-flight checklist below passes (those are the real-device gates the build
couldn't self-verify).

## Pre-flight (do these in order, on a real iPhone)

These came from the milestone real-device gates. Each is staged because it needs
your accounts / phone / real funds.

### 0. Deploy & accounts (from DEPLOY.md)
- [ ] Dynamic project created; Telegram login enabled; EVM (Base) + TON enabled.
- [ ] `VITE_DYNAMIC_ENVIRONMENT_ID` set in Vercel (Production) and `.env.local`.
- [ ] `vercel --prod` deployed; URL noted.
- [ ] BotFather `@aave_yield_bot` Web App URL points at the Vercel URL.

### 1. iPhone launch (Milestone 2 gate)
- [ ] Open `@aave_yield_bot` on iPhone. Force-close Telegram, reopen, tap launch.
- [ ] App loads with **no "Storage Unavailable" / init-data error**.
      (Should be handled by HTML5 history routing + await-init-before-render.)

### 2. Auth → stable EOA (Milestone 3 gate)
- [ ] Tap "Sign in with Telegram" → returns an EVM address on the home card.
- [ ] Cross-device: sign in on macOS too → **same EVM EOA**.
- [ ] Confirm the EOA on basescan.org (fresh, 0 balance initially).

### 3. Deposit smoke test (Milestone 5 gate) — REAL MONEY ($2–3 USDT-TON)
- [ ] Enter ~$2–3 USDT, quote populates, tap Confirm.
- [ ] TON escrow transfer signs in the Dynamic TON wallet.
- [ ] Progress runs Bridging → Settling → Supplying → Done.
- [ ] USDC arrives on the Base EOA; supply lands as aUSDC; balance card updates.
- [ ] **Watch:** settlement relies on `orderTrack` firing `outputPositionPhase`
      → secret disclosure. If it hangs at "Settling," that's the place to debug.

### 4. Withdraw smoke test (Milestone 6 gate) — REAL MONEY
- [ ] Enter an amount ≤ supplied, quote populates, tap Confirm.
- [ ] Aave withdraw fires on Base; EIP-2612 permit signs (no separate approval tx).
- [ ] Order registers; progress runs Withdrawing → Signing → Bridging → Done.
- [ ] USDT-TON arrives in the TON wallet.
- [ ] **If the permit reverts:** switch to Permit2 (note in `src/lib/evm-order.ts`).

## Recording script (≈5 min)

1. **(0:00) Hook** — "USDT sitting idle on TON. Let's earn USD yield on it from
   inside Telegram, on real mainnet, in one tap." Open the bot on the iPhone.
2. **(0:20) Sign in** — tap Sign in with Telegram. Show the EVM address appear.
   Mention: stable, cross-device, exportable — no seed phrase.
3. **(0:50) Home** — scroll the live Aave Base markets + APYs. Point at USDC.
4. **(1:20) Deposit** — enter the amount, show the quote, Confirm, sign in the
   TON wallet. Narrate the honest timing: "HTLC swap, ~2–5 min, you can close
   the app." (Cut the wait in the edit — don't fake it, just trim.)
5. **(2:30) Yield** — back on home, USDC now earning Y% APY on Aave. Show aUSDC /
   basescan if time.
6. **(3:10) Withdraw** — enter amount, Confirm, one permit signature, bridge back.
   Show USDT-TON landing in the TON wallet.
7. **(4:20) Close** — "STON.fi Omniston + Aave V3 + Dynamic. Composed primitives,
   real money, non-custodial. That's it."

Don't compress the bridge dishonestly — show the real experience, just trim dead
wait time in the edit.

## Submit (after recording — NOT done by the agent)
- [ ] Upload Loom.
- [ ] Push repo, confirm README + DEPLOY render.
- [ ] Submit before **June 8 08:00 UTC**.
