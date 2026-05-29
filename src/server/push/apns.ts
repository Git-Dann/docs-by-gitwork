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
  const authKeyPem = process.env.APNS_AUTH_KEY;
  const isProduction = process.env.APNS_PRODUCTION === "true";

  if (!keyId || !teamId || !bundleId || !authKeyPem) {
    return null;
  }
  return { keyId, teamId, bundleId, authKeyPem, isProduction };
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
