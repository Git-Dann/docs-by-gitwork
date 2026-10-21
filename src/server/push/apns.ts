// Apple Push Notification service (APNs) provider client.
//
// Uses Node's built-in http2 module + jose for ES256 JWT signing. No extra
// runtime deps (jose is already used by NextAuth). One fresh HTTP/2 session
// per send — appropriate for Vercel's serverless model where keeping
// long-lived sockets between cold starts is wasted.
//
// Required env vars (push is a no-op if any are missing):
//   APNS_KEY_ID      10-char key ID from App Store Connect → Keys
//   APNS_TEAM_ID     Apple Developer Team ID (also in project.yml as DEVELOPMENT_TEAM)
//   APNS_BUNDLE_ID   App bundle identifier (apns-topic header)
//   APNS_AUTH_KEY    PEM-encoded contents of the .p8 file (with line breaks intact)
//   APNS_PRODUCTION  "true" for production gateway, anything else for sandbox
//
// All env vars are read lazily inside send() so a missing config never crashes
// at import time.

import * as http2 from "node:http2";
import { SignJWT, importPKCS8 } from "jose";

const PRODUCTION_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const JWT_TTL_SECONDS = 50 * 60; // APNs allows up to 60min; renew slightly early

/**
 * APNs rejects an oversized payload outright — it does NOT truncate it.
 *
 * ⚠️ Worth being explicit about, because the intuition is usually the other way round:
 * iOS truncates the *display* of a long alert, so it is natural to assume a long body
 * is simply shortened. It is not. A payload over the limit is refused with 413
 * `PayloadTooLarge` and the notification is never delivered — so a message long enough
 * to be worth sending would be exactly the one that silently fails to arrive.
 *
 * 4096 bytes is Apple's documented maximum for an alert notification. Measured in
 * BYTES, not characters: one emoji is four.
 */
export const APNS_MAX_PAYLOAD_BYTES = 4096;

export type ApnsPushType = "alert" | "background" | "voip";

export type ApnsAlert = {
  title?: string;
  subtitle?: string;
  body?: string;
};

export type ApnsPayload = {
  aps: {
    alert?: ApnsAlert | string;
    badge?: number;
    sound?: string | { critical?: 1; name: string; volume?: number };
    "thread-id"?: string;
    "mutable-content"?: 1;
    "content-available"?: 1;
    category?: string;
  };
  // Custom keys — anything outside `aps` is delivered as userInfo to the app.
  [key: string]: unknown;
};

export type ApnsSendResult =
  | { ok: true; apnsId: string }
  | { ok: false; reason: ApnsFailureReason; status: number };

/**
 * Failure reasons we care about distinguishing — full list at
 * https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
 *
 * `BadDeviceToken`, `Unregistered`, `DeviceTokenNotForTopic` → soft-delete the device row.
 * Everything else → transient or config issue, leave the row alone.
 */
export type ApnsFailureReason =
  | "BadDeviceToken"
  | "Unregistered"
  | "DeviceTokenNotForTopic"
  | "BadTopic"
  | "TopicDisallowed"
  | "ExpiredProviderToken"
  | "InvalidProviderToken"
  | "TooManyRequests"
  | "InternalServerError"
  | "ServiceUnavailable"
  | "PayloadTooLarge"
  | "Unknown"
  | "NotConfigured"
  | "NetworkError";

type ApnsConfig = {
  keyId: string;
  teamId: string;
  bundleId: string;
  authKeyPem: string;
  isProduction: boolean;
};

function readConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  const authKeyPem = normalisePem(process.env.APNS_AUTH_KEY);
  const isProduction = process.env.APNS_PRODUCTION === "true";

  if (!keyId || !teamId || !bundleId || !authKeyPem) {
    warnUnconfiguredOnce([
      !keyId && "APNS_KEY_ID",
      !teamId && "APNS_TEAM_ID",
      !bundleId && "APNS_BUNDLE_ID",
      !authKeyPem && "APNS_AUTH_KEY",
    ].filter((v): v is string => Boolean(v)));
    return null;
  }

  // ⚠️ PRESENT IS NOT USABLE, and this cost a fortnight of missing pushes.
  // A `.env` holds one line per variable, so pasting a `.p8` straight in
  // leaves `APNS_AUTH_KEY=-----BEGIN PRIVATE KEY-----` and strands the key
  // body on the lines below as malformed entries the parser drops. The
  // variable is then SET, non-empty, and worthless — so the check above
  // passed, nothing warned, and signing failed per push instead.
  //
  // Exactly §35's shape one layer in: "we have a value" read as "we have a
  // working value". The shape is checked here, where it can still be said.
  if (!isCompletePem(authKeyPem)) {
    warnUnusableKeyOnce(describePemProblem(authKeyPem));
    return null;
  }

  return { keyId, teamId, bundleId, authKeyPem, isProduction };
}

/**
 * The PEM as the signer needs it: real newlines.
 *
 * A `.env` cannot carry a literal newline inside a value, so the only forms
 * that survive the file are a `\n`-escaped single line and a quoted block.
 * Both are accepted and normalised here rather than each caller guessing —
 * and `\r` goes too, because a key pasted from Windows or from a browser
 * carries them and they break the base64 body.
 */
function normalisePem(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\r\\n|\\n/g, "\n")
    .replace(/\r/g, "");
  return text.length ? text : undefined;
}

/** A PEM with a header, a footer and something between them. */
function isCompletePem(pem: string): boolean {
  const begin = /-----BEGIN [A-Z ]*PRIVATE KEY-----/.exec(pem);
  const end = /-----END [A-Z ]*PRIVATE KEY-----/.exec(pem);
  if (!begin || !end || end.index <= begin.index) return false;
  const body = pem.slice(begin.index + begin[0].length, end.index).replace(/\s+/g, "");
  // A P-256 key is ~200 base64 characters; anything far short of that is a
  // fragment, not a key.
  return body.length >= 100 && /^[A-Za-z0-9+/=]+$/.test(body);
}

/** What is wrong with it, in words — never any of the key itself. */
function describePemProblem(pem: string): string {
  const hasBegin = /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem);
  const hasEnd = /-----END [A-Z ]*PRIVATE KEY-----/.test(pem);
  if (hasBegin && !hasEnd) {
    return "it is the PEM header with no key body — the .p8 was pasted into .env as multiple lines, " +
      "so only its first line was kept";
  }
  if (!hasBegin) return "it carries no PEM header";
  return "its body is too short to be a signing key";
}

let warnedUnconfigured = false;

/**
 * Says so, once, when push is asked for and cannot happen.
 *
 * ⚠️ Every sender here already treats an unconfigured gateway as a quiet skip,
 * which is right — a notification must never fail the work that triggered it.
 * But quiet at BOTH ends means a server with no APNs config looks exactly like a
 * server with nothing to send: no push ever arrives and nothing anywhere says
 * why. That is the shape of defect this codebase keeps paying for — a missing
 * secret that only reveals itself as a feature that silently does nothing
 * (§35's GITHUB_TOKEN, §60's course feed).
 *
 * Once per process, so a busy standup morning does not fill the log.
 */
let warnedUnusableKey = false;

/**
 * Says so, once, when the key is there and cannot sign.
 *
 * ⚠️ Deliberately a SEPARATE message from `warnUnconfiguredOnce`. "Nobody set
 * this up" and "this is set up wrong" have different fixes, and collapsing
 * them sends whoever reads the log to add a secret that is already there.
 * That conflation is what §35 records costing a day.
 */
function warnUnusableKeyOnce(problem: string): void {
  if (warnedUnusableKey) return;
  warnedUnusableKey = true;
  console.warn(
    `[push] APNS_AUTH_KEY is set but cannot sign — every push will be skipped, because ${problem}. ` +
      `Store the .p8 as ONE line with literal \\n between its lines, or quote the whole block. ` +
      `Set it as the deploy user in /opt/apps/foundry/.env — never with sudo (CLAUDE.md §60.4).`,
  );
}

function warnUnconfiguredOnce(missing: string[]): void {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  console.warn(
    `[push] APNs is not configured — every push will be skipped. Missing: ${missing.join(", ")}. ` +
      `The single-line vars sync from GitHub Actions secrets; APNS_AUTH_KEY is a multi-line PEM and ` +
      `is set by hand in /opt/apps/foundry/.env.`,
  );
}

// ─── Provider token (JWT) cache ─────────────────────────────────────────────
// One JWT per (teamId, keyId) pair, cached up to 50 min. APNs charges no
// per-token fee, but signing every push wastes ~5ms of CPU.

let cachedJwt: { token: string; expiresAt: number; keyId: string } | null = null;

async function getProviderJwt(config: ApnsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now + 60 && cachedJwt.keyId === config.keyId) {
    return cachedJwt.token;
  }

  const key = await importPKCS8(config.authKeyPem, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId, typ: "JWT" })
    .setIssuer(config.teamId)
    .setIssuedAt(now)
    .sign(key);

  cachedJwt = {
    token,
    expiresAt: now + JWT_TTL_SECONDS,
    keyId: config.keyId,
  };
  return token;
}

// ─── Send ───────────────────────────────────────────────────────────────────

export type SendApnsArgs = {
  deviceToken: string;
  environment: "sandbox" | "production";
  payload: ApnsPayload;
  pushType?: ApnsPushType;
  expiration?: number; // unix seconds; 0 = APNs decides
  priority?: 5 | 10; // 10 = immediate, 5 = power-conscious
  collapseId?: string; // groups notifications on the device — overrides previous with same id
};

/**
 * Sends a single APNs push. Opens a fresh HTTP/2 session per send and closes
 * it as soon as the response arrives — appropriate for Vercel's stateless
 * functions where persistent connections don't survive between invocations.
 */
export async function sendApns(args: SendApnsArgs): Promise<ApnsSendResult> {
  const config = readConfig();
  if (!config) {
    return { ok: false, reason: "NotConfigured", status: 0 };
  }

  let providerJwt: string;
  try {
    providerJwt = await getProviderJwt(config);
  } catch (error) {
    console.error("[apns] failed to mint provider JWT", error);
    return { ok: false, reason: "InvalidProviderToken", status: 0 };
  }

  // Sandbox vs production gateway is chosen by the *device's* registration
  // environment, not by APNS_PRODUCTION — a TestFlight build on a phone
  // returns a sandbox token even if our server thinks it's "production".
  // Honour what the device told us.
  const host = args.environment === "production" ? PRODUCTION_HOST : SANDBOX_HOST;

  const body = JSON.stringify(args.payload);
  const path = `/3/device/${args.deviceToken}`;

  return new Promise<ApnsSendResult>((resolve) => {
    const client = http2.connect(host);
    const settled = { value: false };

    const finish = (result: ApnsSendResult) => {
      if (settled.value) return;
      settled.value = true;
      try { client.close(); } catch { /* ignore close errors */ }
      resolve(result);
    };

    client.on("error", (error) => {
      console.warn("[apns] http2 client error", error);
      finish({ ok: false, reason: "NetworkError", status: 0 });
    });

    const req = client.request({
      ":method": "POST",
      ":path": path,
      "authorization": `bearer ${providerJwt}`,
      "apns-topic": config.bundleId,
      "apns-push-type": args.pushType ?? "alert",
      "apns-priority": String(args.priority ?? 10),
      "apns-expiration": String(args.expiration ?? 0),
      ...(args.collapseId ? { "apns-collapse-id": args.collapseId } : {}),
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body).toString(),
    });

    let status = 0;
    let responseBody = "";
    let apnsId = "";

    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
      apnsId = (headers["apns-id"] as string | undefined) ?? "";
    });

    req.setEncoding("utf8");
    req.on("data", (chunk) => { responseBody += chunk; });

    req.on("end", () => {
      if (status === 200) {
        finish({ ok: true, apnsId });
        return;
      }
      // APNs error body shape: { reason: "<reason>", timestamp?: number }
      let reason: ApnsFailureReason = "Unknown";
      try {
        const parsed = JSON.parse(responseBody) as { reason?: string };
        if (parsed.reason) reason = parsed.reason as ApnsFailureReason;
      } catch {
        // Body wasn't JSON — leave as Unknown.
      }
      finish({ ok: false, reason, status });
    });

    req.on("error", (error) => {
      console.warn("[apns] request error", error);
      finish({ ok: false, reason: "NetworkError", status: 0 });
    });

    req.write(body);
    req.end();
  });
}

/**
 * True when APNs is configured in env. Useful for diagnostics endpoints and to
 * gate "register device" client flows when push isn't actually wired up yet.
 */
export function isApnsConfigured(): boolean {
  return readConfig() !== null;
}
