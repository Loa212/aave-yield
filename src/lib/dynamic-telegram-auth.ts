// Custom Telegram → Dynamic sign-in driving the OAuth code+state flow.
//
// WHY THIS EXISTS: our Dynamic environment's Telegram provider is provisioned
// for the OAuth-widget (code+state) flow, NOT the bare bot-token flow. The SDK's
// `telegramSignIn({ authToken })` only sends `telegramAuthToken`, so the server
// rejects it with `400 Invalid or expired OAuth state` — it expects a state and
// an OAuth code established via /telegram/auth first. We reverse-engineered the
// working sequence by probing the live API (every field verified against a 200):
//
//   1. POST /telegram/auth            { state, telegramUser }   -> 202 (issues a code bound to state)
//   2. POST /providers/telegram/oauthResult { state }           -> 200 { code, status:"completed" }
//   3. POST /telegram/signin { code, state, sessionPublicKey, telegramAuthToken, forceCreateUser }
//                                                                -> 200 { jwt, user, ... }  ✅
//
// `sessionPublicKey` MUST come from the SDK's own generateSessionKeys() so the
// SDK holds the matching private key (needed for embedded-wallet session
// signing). We then inject the 200 response via updateAuthFromVerifyResponse so
// the SDK's React state (isLoggedIn, userWallets) updates as if it had signed in
// natively.
//
// All field shapes are load-bearing and were confirmed against the live server:
// - telegramUser: camelCase keys, `authDate` as STRING, `id` as NUMBER, + hash.
// - sessionPublicKey: base64URL (no padding) to satisfy the server's charset regex.
// The telegramUser (with its Telegram data-check hash) is minted server-side by
// /api/bot?action=mint, which validates the WebApp initData first.

import {
  generateSessionKeys,
  getDefaultClient,
  getSessionKeys,
  updateAuthFromVerifyResponse,
} from "@dynamic-labs-sdk/client/core";

/** The telegramUser shape Dynamic's /telegram/auth expects (from /api/bot mint). */
export interface TelegramUserPayload {
  authDate: string;
  firstName: string;
  lastName: string;
  username: string;
  id: number;
  photoURL: string;
  hash: string;
}

const API_BASE = "https://app.dynamicauth.com/api/v0/sdk";

/** A throwaway, URL-safe random state for the OAuth handshake. */
function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Read the SDK's session public key as base64URL (no padding). */
async function getSessionPublicKeyBase64Url(): Promise<string> {
  const client = getDefaultClient();
  // Generate (and persist) the session keypair inside the SDK, then read it back.
  await generateSessionKeys(client);
  const keys = await getSessionKeys(client);
  // getSessionKeys returns the keypair; the public key field name has varied
  // across SDK versions, so normalize defensively.
  const pub =
    (keys as { publicKey?: string }).publicKey ??
    (keys as { sessionPublicKey?: string }).sessionPublicKey ??
    "";
  if (!pub) throw new Error("Could not read session public key from SDK");
  // Normalize to base64URL without padding (server charset regex rejects '=').
  return pub.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${API_BASE}/${getEnvId()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* some endpoints (202) return empty bodies */
  }
  return { status: res.status, json };
}

function getEnvId(): string {
  const id = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID ?? "";
  if (!id) throw new Error("VITE_DYNAMIC_ENVIRONMENT_ID is not set");
  return id;
}

/**
 * Run the full OAuth code+state Telegram sign-in and inject the session.
 * Returns true on success (the SDK's auth state will have flipped).
 */
export async function telegramOAuthSignIn(
  telegramAuthToken: string,
  telegramUser: TelegramUserPayload,
): Promise<boolean> {
  const state = randomState();

  // SDK-owned session keypair (SDK keeps the private key).
  const sessionPublicKey = await getSessionPublicKeyBase64Url();

  // Step 1 — establish the state and issue an OAuth code for this telegramUser.
  const auth = await postJson("/telegram/auth", { state, telegramUser });
  if (auth.status !== 202) {
    throw new Error(
      `/telegram/auth failed: ${auth.status} ${JSON.stringify(auth.json)}`,
    );
  }

  // Step 2 — retrieve the OAuth code for the state.
  const result = await postJson("/providers/telegram/oauthResult", { state });
  const code = (result.json as { code?: string } | null)?.code;
  if (!code) {
    throw new Error(
      `oauthResult returned no code: ${result.status} ${JSON.stringify(result.json)}`,
    );
  }

  // Step 3 — complete sign-in with code + state + sessionPublicKey + token.
  const signin = await postJson("/telegram/signin", {
    code,
    state,
    sessionPublicKey,
    telegramAuthToken,
    forceCreateUser: true,
  });
  if (signin.status !== 200) {
    throw new Error(
      `/telegram/signin failed: ${signin.status} ${JSON.stringify(signin.json)}`,
    );
  }

  // Inject the verify response so the SDK's React state (isLoggedIn, wallets)
  // updates exactly as a native sign-in would. The /telegram/signin 200 body IS
  // the VerifyResponse shape ({ jwt, minifiedJwt, expiresAt, user }); cast to the
  // function's expected param type rather than naming the (internal) type.
  type VerifyResponseArg = Parameters<
    typeof updateAuthFromVerifyResponse
  >[0]["response"];
  updateAuthFromVerifyResponse(
    { response: signin.json as VerifyResponseArg },
    getDefaultClient(),
  );
  return true;
}
