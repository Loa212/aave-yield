# Deploy & external-account setup

These steps need YOUR accounts (Vercel, Dynamic, BotFather). The agent built and
verified everything it could locally; these are the human-in-the-loop bits.

## 1. Dynamic dashboard (app.dynamic.xyz)

1. Create a project → copy the **Environment ID**.
2. Enable the **Telegram** social login provider.
3. Under **Chains/Networks**, enable **EVM (Base)** and **TON**.
4. Add your Vercel deploy URL (and `http://localhost:5174`) to the allowed
   **CORS / redirect origins**.

Set the env var locally:

```
echo "VITE_DYNAMIC_ENVIRONMENT_ID=<your-id>" > .env.local
```

## 2. Vercel

```bash
vercel login          # interactive, browser
vercel link           # link this dir to a project
vercel env add VITE_DYNAMIC_ENVIRONMENT_ID   # paste the Dynamic env ID (Production + Preview)
vercel --prod         # deploy
```

`vercel.json` is already configured:
- `buildCommand: vite build` (skips local-only `tsc` step on CI)
- SPA rewrite so TanStack Router nested routes (`/deposit`, `/withdraw`, …)
  resolve to `index.html`.

## 3. BotFather (@aave_yield_bot)

1. `/newapp` (or `/myapps` → your bot) in @BotFather.
2. Set the **Web App URL** to your Vercel production URL.
3. Configure the menu button / direct link.

## 4. Real-device verification (Milestone 2 gate)

Open `@aave_yield_bot` on a real iPhone. Force-close Telegram, reopen, launch.
The Mini App must load without "Storage Unavailable" or init-data errors.
(Should already be handled by HTML5 history routing + await-init-before-render.)
