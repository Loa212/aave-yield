/**
 * Register the Telegram webhook for the auth bot (api/bot.ts).
 *
 * Reads TELEGRAM_BOT_TOKEN + LOGIN_URL from .env.local (Bun auto-loads it), so
 * the bot token never lands in shell history. Points Telegram at
 * `<LOGIN_URL>/api/bot` and prints getWebhookInfo to confirm.
 *
 *   bun run webhook:register              # uses LOGIN_URL from .env.local
 *   bun run webhook:register <url>        # override the base URL (e.g. a preview deploy)
 *
 * Run `webhook:info` to inspect, `webhook:delete` to remove.
 */
export {}; // make this a module so top-level await is allowed

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = (
  process.argv[2] ??
  process.env.LOGIN_URL ??
  "https://aave-yield-chi.vercel.app"
).replace(/\/$/, "");

if (!TOKEN) {
  console.error(
    "✗ TELEGRAM_BOT_TOKEN is not set. Add it to .env.local (see .env.example).",
  );
  process.exit(1);
}

const api = (method: string) =>
  `https://api.telegram.org/bot${TOKEN}/${method}`;

const mode = process.argv.includes("--delete")
  ? "delete"
  : process.argv.includes("--info")
    ? "info"
    : "register";

async function call(method: string, params?: Record<string, string>) {
  const url = params
    ? `${api(method)}?${new URLSearchParams(params)}`
    : api(method);
  const res = await fetch(url);
  return (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: unknown;
  };
}

if (mode === "delete") {
  const r = await call("deleteWebhook", { drop_pending_updates: "true" });
  console.log(r.ok ? "✓ Webhook deleted." : `✗ ${r.description}`);
  process.exit(r.ok ? 0 : 1);
}

if (mode === "info") {
  const r = await call("getWebhookInfo");
  console.log(JSON.stringify(r.result, null, 2));
  process.exit(0);
}

// register
const webhookUrl = `${BASE_URL}/api/bot`;
console.log(`→ Setting webhook to ${webhookUrl}`);
const set = await call("setWebhook", {
  url: webhookUrl,
  allowed_updates: JSON.stringify(["message"]),
});

if (!set.ok) {
  console.error(`✗ setWebhook failed: ${set.description}`);
  process.exit(1);
}
console.log("✓ Webhook set.");

const info = await call("getWebhookInfo");
console.log("\ngetWebhookInfo:");
console.log(JSON.stringify(info.result, null, 2));

const result = info.result as { url?: string; last_error_message?: string };
if (result.last_error_message) {
  console.warn(
    `\n⚠ Telegram reported a recent delivery error: ${result.last_error_message}\n` +
      "  (Usually means the deployment isn't live yet, or /api/bot isn't reachable. " +
      "Deploy first, then re-run. Telegram retries automatically.)",
  );
}
console.log(`\nDone. DM the bot /start to get the launch button.`);
