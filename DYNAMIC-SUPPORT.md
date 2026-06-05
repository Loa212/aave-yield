# Dynamic support request — Telegram sign-in "Invalid or expired OAuth state"

Paste this to Dynamic (Slack/support). It contains the full reproduction.

---

**Environment:** `ef881844-6a7d-4252-986b-c003d736503c` (Sandbox)
**SDK:** `@dynamic-labs/sdk-react-core` + `@dynamic-labs/ethereum` + `@dynamic-labs/ton` 4.88.1
**App:** Telegram Mini App on `https://aave-yield-chi.vercel.app` (iOS Telegram WebView)
**Telegram provider:** "Your credentials" (own bot `@aave_yield_bot`, token pasted in dashboard, `/setdomain` → app.dynamicauth.com)
**Embedded Wallet:** enabled, "Create on sign up" on.

**Problem:** `telegramSignIn({ authToken, forceCreateUser: true })` →
`POST /api/v0/sdk/{env}/telegram/signin` returns
`400 {"error":"Invalid or expired OAuth state"}`.
The SDK then swallows the error (resolves successfully) but `isLoggedIn` stays false.

**We launch via initData-mint, not the URL token:** Telegram strips `?telegramAuthToken`
from `web_app` launch URLs on iOS (confirmed: search/hash/start_param all empty), so we
post `window.Telegram.WebApp.initData` to our backend, validate it
(`HMAC(botToken,"WebAppData")`), mint the JWT exactly like your reference `scripts/bot.ts`,
and call `telegramSignIn({ authToken })`. The SDK uses `authToken` over the URL.

**Reproduction of the 400 against `/telegram/signin` (env's own bot token), 3 tiers:**

| Token variant | Response |
|---|---|
| Correct bot token + correct Telegram inner hash | **400 `Invalid or expired OAuth state`** |
| Correct JWT-signing token, WRONG inner Telegram hash | 403 `Invalid authentication verification` |
| Different bot token entirely | 422 `JsonWebTokenError: invalid signature` |

So the **bot token matches** (not 422) and the **Telegram data-check hash is valid**
(not 403). Only the final **OAuth-state** check fails (400).

**Ruled out client-side:**
- Storage: `localStorage`, `indexedDB`, `crypto.subtle` all OK in the WebView.
- SDK init completes (`sdkHasLoaded: true`); no errors before signin.
- The signin request body is complete:
  `{ telegramAuthToken (valid), forceCreateUser, sessionPublicKey (SET) }`.
  So `sessionPublicKey` is NOT empty.
- Embedded Wallets enabled for Ethereum AND TON; "Create on sign up" on.

**Network sequence (the key clue):**
```
GET  /api/v0/sdk/{env}/settings        → 200   (bootstrap)
POST /api/v0/sdk/{env}/telegram/signin → 400 "Invalid or expired OAuth state"
GET  /api/v0/sdk/{env}/nonce           → 200   (fetched AFTER the 400, not before)
```
The `/nonce` call happens AFTER signin. So at signin time no nonce/OAuth-state
session is established — which looks like the cause of the 400. There is no
state-registration call before `/telegram/signin`.

**Questions:**
1. What establishes the "OAuth state" the signin endpoint validates, and why would it be
   missing/expired for a token-based Telegram sign-in?
2. The OpenAPI schema marks `code` and `sessionPublicKey` as required NonEmptyString, but the
   SDK's token path sends `telegramAuthToken` without `code`. Is a `code`/state prerequisite
   call required even when a `telegramAuthToken` is provided?
3. Is the Cookie-Based Authentication Domain required for Telegram sign-in? We can't
   DNS-validate it on a `*.vercel.app` subdomain.
4. Any Telegram + "Your credentials" + Sandbox setup step we're missing?
