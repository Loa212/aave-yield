// TEMP probe: mint a telegramAuthToken exactly like api/bot.ts, then hit BOTH
// Dynamic endpoints — /checkTelegramAuth and /telegram/signin — to isolate WHERE
// the "Invalid or expired OAuth state" 400 comes from.
//
//   checkTelegramAuth OK + signin 400  -> token is fine; failure is in the 4.x
//                                          signin/session-key/state layer.
//   both 400                            -> token itself rejected by the server.
//
// Run: node --env-file=.env.local scripts/probe-telegram-auth.mjs
import crypto from "node:crypto";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ENV = process.env.VITE_DYNAMIC_ENVIRONMENT_ID ?? "";
if (!TOKEN || !ENV) {
  console.error("Missing TELEGRAM_BOT_TOKEN or VITE_DYNAMIC_ENVIRONMENT_ID");
  process.exit(1);
}

const base64url = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function signJwtHs256(payload, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = base64url(
    crypto.createHmac("sha256", secret).update(data).digest(),
  );
  return `${data}.${sig}`;
}

function generateTelegramHash(data) {
  const fields = {
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

function mintToken({ authDateMs, hashOverride, signSecret }) {
  const userData = {
    authDate: authDateMs,
    firstName: "Probe",
    lastName: "",
    username: "probe_user",
    id: 123456789,
    photoURL: "",
  };
  const hash = hashOverride ?? generateTelegramHash(userData);
  return signJwtHs256({ ...userData, hash }, signSecret ?? TOKEN);
}

const BASE = `https://app.dynamicauth.com/api/v0/sdk/${ENV}`;

async function hit(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let text = "";
  try {
    text = await res.text();
  } catch {}
  return { status: res.status, body: text.slice(0, 300) };
}

async function run() {
  const now = Math.floor(Date.now());
  const tokGood = mintToken({ authDateMs: now });
  const tokBadHash = mintToken({ authDateMs: now, hashOverride: "deadbeef" });
  const tokBadSig = mintToken({ authDateMs: now, signSecret: "wrongsecret" });

  console.log(`env: ${ENV}`);
  console.log(`base: ${BASE}\n`);

  const cases = [
    ["good token+hash, forceCreate", { telegramAuthToken: tokGood, forceCreateUser: true }],
    ["good token+hash, NO forceCreate", { telegramAuthToken: tokGood }],
    ["good + sessionPublicKey", { telegramAuthToken: tokGood, forceCreateUser: true, sessionPublicKey: "abc123" }],
    ["good + state=xyz", { telegramAuthToken: tokGood, forceCreateUser: true, state: "xyz" }],
    ["BAD inner telegram hash", { telegramAuthToken: tokBadHash, forceCreateUser: true }],
    ["BAD jwt signature", { telegramAuthToken: tokBadSig, forceCreateUser: true }],
  ];

  console.log("================ /telegram/signin validation chain ================");
  for (const [label, body] of cases) {
    const r = await hit("/telegram/signin", body);
    console.log(`  ${label.padEnd(36)} -> ${r.status}  ${r.body}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
