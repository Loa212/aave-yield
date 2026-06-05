# Deploy & external-account setup

These steps need YOUR accounts (Vercel, Dynamic, BotFather). The agent built and
verified everything it could locally; these are the human-in-the-loop bits.

## How Telegram auth actually works (read this first)

Dynamic's `telegramSignIn()` does NOT mint the auth token — it only reads
`?telegramAuthToken=<JWT>` from the Mini App's launch URL and verifies it against
your bot token. So two pieces are required:

- **Minting** — our bot webhook (`api/bot.ts`) signs the JWT and puts it in the
  Mini App launch URL. Lives in this repo, deploys with the app.
- **Verifying** — Dynamic verifies that JWT using the bot token you paste into
  the Dynamic dashboard.

Both use the SAME BotFather bot token. If either is missing you get
"telegramAuthToken was not found" / "missing environmentId"-style errors.

## 1. Dynamic dashboard (app.dynamic.xyz)

Do this for EACH environment you ship (Sandbox for testing, Live for the real
Loom — config is per-environment).

1. Copy the **Environment ID** (top bar) → this is `VITE_DYNAMIC_ENVIRONMENT_ID`.
2. **Log in & User Profile → Telegram**: enable "Use for log in & sign up".
   - **Credentials**: choose **Your credentials**, paste **Bot Name** +
     **Bot Token** (from BotFather). (Sandbox also offers "Dynamic credentials"
     — managed bot — but Live requires your own.)
3. **Chains & Networks**: enable **EVM (Base)** and **TON**.
4. **Developers → Domains → Cookie-Based Authentication Domain**: add the host
   only, e.g. `aave-yield-chi.vercel.app` (no https://, no trailing slash).
5. **Developers → SDK & API Keys → CORS Origin** (or Security): add
   `https://<app>.vercel.app` and `http://localhost:5174`.

Local env var:

```
echo "VITE_DYNAMIC_ENVIRONMENT_ID=<your-id>" > .env.local
```

## 2. BotFather (@aave_yield_bot)

1. Create the bot / get its **token** (`/newbot` or an existing bot's `/token`).
2. `/setdomain` → select the bot → send `app.dynamicauth.com`
   (Telegram's login widget only trusts this domain; it's shown in the Dynamic
   Telegram config panel).
3. `/newapp` (or `/myapps`) → set the **Web App URL** to your Vercel URL.

## 3. Vercel

```bash
vercel login
vercel link
# App: Dynamic env id (inlined into the bundle at BUILD time — must be set
# BEFORE the build, scoped to Production)
vercel env add VITE_DYNAMIC_ENVIRONMENT_ID
# Bot webhook secrets (server-side only, NOT VITE_-prefixed):
vercel env add TELEGRAM_BOT_TOKEN          # the BotFather token
vercel env add LOGIN_URL                   # optional; defaults to the prod URL in api/bot.ts
vercel --prod --force                      # --force = no build cache (so env vars re-inline)
```

> ⚠️ Vite inlines `VITE_*` at build time. If you add/change the env var, you MUST
> redeploy WITHOUT build cache (`--force`, or uncheck "Use existing Build Cache").
> A plain redeploy serves the old bundle and Dynamic throws "missing environmentId".

`vercel.json` is already configured:
- `buildCommand: vite build`
- SPA rewrite that EXCLUDES `/api`, so `api/bot.ts` is reachable as a function
  while `/deposit`, `/withdraw`, … still resolve to `index.html`.

## 4. Register the Telegram webhook (one time)

Point Telegram at the bot function so `/start` triggers it:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<app>.vercel.app/api/bot"
# verify:
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Then DM the bot `/start` → it replies with an "Open Aave Yield 🚀" button whose
URL carries `?telegramAuthToken=…`. Launching from THAT button is what makes
sign-in work. (Launching via the BotFather menu/direct link won't carry the
token — always test via the `/start` button.)

## 5. Real-device verification (Milestone 2 + 3 gates)

Open `@aave_yield_bot` on a real iPhone, `/start`, tap the launch button.
- Mini App loads with no "Storage Unavailable" / init-data error.
- Tap "Sign in with Telegram" → an EVM address appears.
- Sign in on a second device → same EVM EOA.
