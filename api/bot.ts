import crypto from "node:crypto";

/**
 * Telegram bot webhook — mints the `telegramAuthToken` Dynamic needs.
 *
 * WHY THIS EXISTS: Dynamic's `telegramSignIn()` only reads
 * `?telegramAuthToken=<JWT>` from the Mini App's launch URL (verified against the
 * installed SDK source). Dynamic verifies that JWT with the bot token you paste
 * in the dashboard, but it does NOT mint it — that's this bot's job. On `/start`
 * we sign a JWT over the Telegram user data (HS256, bot token as secret, with the
 * Telegram data-check HMAC inside) and reply with a Web App button whose URL
 * carries the token. Adapted from Dynamic's reference scripts/bot.ts, reshaped
 * as a Vercel webhook (no always-on process) and dependency-free (Node crypto
 * for both the HMAC and the JWT, so nothing extra ships).
 *
 * SETUP (see DEPLOY.md):
 *   1. Set TELEGRAM_BOT_TOKEN (+ optional LOGIN_URL) in Vercel env.
 *   2. Register the webhook once:
 *      curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>.vercel.app/api/bot"
 *   3. In Dynamic dashboard: paste the same bot token under Telegram → Your credentials.
 *   4. In BotFather: /setdomain → app.dynamicauth.com
 */

// Minimal Vercel handler types (no @vercel/node dep needed).
interface VercelReq {
  method?: string;
  body?: unknown;
}
interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
  send: (body: string) => void;
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
// Where the Mini App is hosted. Defaults to the known prod URL but override via
// env so preview deploys / domain changes don't need a code edit.
const LOGIN_URL = (
  process.env.LOGIN_URL ?? "https://aave-yield-chi.vercel.app"
).replace(/\/$/, "");

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Sign an HS256 JWT (matches `jwt.sign(payload, secret, { algorithm: "HS256" })`). */
function signJwtHs256(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = base64url(
    crypto.createHmac("sha256", secret).update(data).digest(),
  );
  return `${data}.${sig}`;
}

interface TgUser {
  authDate: number;
  firstName: string;
  lastName: string;
  username: string;
  id: number;
  photoURL: string;
}

/**
 * Telegram auth data-check HMAC: secret = SHA256(botToken), message = the sorted
 * `key=value\n` data-check string of the non-empty user fields. Exactly the
 * Telegram login-widget hashing scheme Dynamic expects.
 */
function generateTelegramHash(data: TgUser): string {
  const fields: Record<string, string> = {
    auth_date: String(data.authDate),
    first_name: data.firstName,
    id: String(data.id),
    last_name: data.lastName,
    photo_url: data.photoURL,
    username: data.username,
  };

  const dataCheckString = Object.entries(fields)
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => `${k}=${v}`)
    .sort((a, b) => a.localeCompare(b))
    .join("\n");

  const secret = crypto.createHash("sha256").update(TOKEN).digest();
  return crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
}

async function sendMessage(chatId: number, text: string, replyMarkup: unknown) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    }),
  });
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== "POST") {
    // GET hits (e.g. health check) — don't 500.
    res.status(200).send("ok");
    return;
  }
  if (!TOKEN) {
    res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not configured" });
    return;
  }

  try {
    const update = (req.body ?? {}) as {
      message?: {
        text?: string;
        chat?: { id: number };
        from?: { id: number; first_name?: string; username?: string };
      };
    };

    const msg = update.message;
    // Respond to /start (the launch entry point). Ack everything else.
    if (msg?.from && msg.chat && (msg.text ?? "").startsWith("/start")) {
      const userData: TgUser = {
        authDate: Math.floor(Date.now() / 1000),
        firstName: msg.from.first_name ?? "",
        lastName: "",
        username: msg.from.username ?? "",
        id: msg.from.id,
        photoURL: "",
      };

      const hash = generateTelegramHash(userData);
      const telegramAuthToken = signJwtHs256({ ...userData, hash }, TOKEN);
      const url = `${LOGIN_URL}/?telegramAuthToken=${encodeURIComponent(
        telegramAuthToken,
      )}`;

      await sendMessage(msg.chat.id, "Tap to open Aave Yield 👇", {
        inline_keyboard: [[{ text: "Open Aave Yield 🚀", web_app: { url } }]],
      });
    }

    // Telegram only needs a 200 to consider the webhook delivered.
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[bot] webhook error", e);
    // Still 200 so Telegram doesn't hammer retries on a transient error.
    res.status(200).json({ ok: false });
  }
}
