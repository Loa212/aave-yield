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
- **TON connector ruled out:** an EVM-only build (`walletConnectors: [EthereumWalletConnectors]`,
  matching your reference repo's `[Ethereum, Solana]` shape) returns the SAME 400. So the
  `@dynamic-labs/ton` connector is not the cause.
- **Our minted token is byte-for-byte identical to your reference `scripts/bot.ts`** — same
  fields, same `authDate: Math.floor(Date.now())` (ms), same `generateTelegramHash` scheme,
  same HS256 signing with the bot token. Diffed directly against your repo.
- **Confirmed against the installed SDK source** (`useSocialAuth.completeConnection`,
  `oauth.telegramSignIn`): for the `telegramAuthToken` path, the SDK sends
  `{ captchaToken, forceCreateUser, sessionPublicKey, telegramAuthToken }` and intentionally
  does NOT send `state` or `code`. So the empty `state`/`code` in our request is the SDK's
  own designed behavior, not a misuse on our side — yet the server still fails the
  "OAuth state" check.

**Network sequence (the key clue):**
```
GET  /api/v0/sdk/{env}/settings        → 200   (bootstrap)
POST /api/v0/sdk/{env}/telegram/signin → 400 "Invalid or expired OAuth state"
GET  /api/v0/sdk/{env}/nonce           → 200   (fetched AFTER the 400, not before)
```
The `/nonce` call happens AFTER signin. So at signin time no nonce/OAuth-state
session is established — which looks like the cause of the 400. There is no
state-registration call before `/telegram/signin`.

**ROOT CAUSE (server-side, proven by direct endpoint probing):**

Our env's `/settings` shows the Telegram provider provisioned as a STATEFUL OAuth provider:
```
telegram: {
  authorizationUrl: ".../sdk/{env}/telegram/auth",   // a state-ISSUING endpoint
  clientId: "@aave_yield_bot",                         // correct bot
  redirectUrl: "https://app.dynamicauth.com",
  createNewAccounts: true,
}
```
Probing the server directly (minted token exactly like your bot, hit the raw endpoints):
- `GET/POST /telegram/auth`  → 400 `request must have required property 'state' (+ telegramUser)`
  → i.e. `/telegram/auth` is the endpoint that ISSUES/validates OAuth state.
- `POST /telegram/signin` with a fully valid bot-JWT → 400 `Invalid or expired OAuth state`,
  and NOTHING in the body changes it (forceCreateUser / sessionPublicKey / a client-supplied
  `state` are all ignored at this gate).

So `/telegram/signin` requires an OAuth-state that is only established by going THROUGH
`/telegram/auth` first. The documented bot-JWT mini-app flow (`telegramSignIn({ authToken })`)
never calls `/telegram/auth`, so no server-side state exists → the 400 every time.
auth_date format ruled out: minting the token with auth_date in SECONDS (real Telegram spec)
vs MILLISECONDS (your reference bot) gives the identical 400.

**The validation order is confirmed (so token + bot config are definitively correct):**
| Request | Response | Means |
|---|---|---|
| BAD JWT signature | 422 `JsonWebTokenError: invalid signature` | layer 1: JWT verified with bot token |
| Valid JWT, BAD inner Telegram hash | 403 `Invalid authentication verification` | layer 2: Telegram data-check hash verified |
| Valid JWT + valid hash (our real token) | **400 `Invalid or expired OAuth state`** | layer 3: the OAuth-state gate — the ONLY failure |

**Questions:**
0. (PRIMARY) Our Telegram provider has `authorizationUrl`/`redirectUrl` set, i.e. it's
   provisioned as a stateful OAuth provider. Does that configuration make `/telegram/signin`
   require state from `/telegram/auth`, breaking the bot-JWT mini-app flow? How should the
   Telegram provider be configured for the documented `telegramSignIn({ authToken })` flow —
   is there a "bot token / mini-app" provider mode vs an "OAuth widget" mode we picked wrong?
1. What establishes the "OAuth state" the signin endpoint validates, and why would it be
   missing/expired for a token-based Telegram sign-in?
2. The OpenAPI schema marks `code` and `sessionPublicKey` as required NonEmptyString, but the
   SDK's token path sends `telegramAuthToken` without `code`. Is a `code`/state prerequisite
   call required even when a `telegramAuthToken` is provided?
3. Is the Cookie-Based Authentication Domain required for Telegram sign-in? We can't
   DNS-validate it on a `*.vercel.app` subdomain.
4. Any Telegram + "Your credentials" + Sandbox setup step we're missing?
