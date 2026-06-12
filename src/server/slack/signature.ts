/**
 * Slack request signature verification.
 *
 * Slack signs every interactivity / events / slash-command POST with an HMAC-SHA-256
 * of `v0:{timestamp}:{body}` keyed by the app's signing secret. The signature is
 * sent in the `X-Slack-Signature` header as `v0=…`, alongside `X-Slack-Request-Timestamp`.
 *
 *   https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * We also reject any request whose timestamp is more than 5 minutes off "now" —
 * Slack's recommended replay defence.
 *
 * NOTE: the body must be the **raw bytes** the route received (no JSON parse first),
 * since the signature is computed over byte-exact content.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const REPLAY_WINDOW_SECONDS = 60 * 5;
const SIGNATURE_VERSION = "v0";

export interface SlackSignatureCheckInput {
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  signingSecret: string;
  /** Override "now" for tests. Seconds since epoch. */
  nowSeconds?: number;
}

export type SlackSignatureResult =
  | { ok: true }
  | { ok: false; reason: "missing-headers" | "stale-timestamp" | "bad-signature" };

export function verifySlackSignature(input: SlackSignatureCheckInput): SlackSignatureResult {
  const { rawBody, signature, timestamp, signingSecret } = input;

  if (!signature || !timestamp || !signingSecret) {
    return { ok: false, reason: "missing-headers" };
  }

  const tsNumber = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(tsNumber)) {
    return { ok: false, reason: "missing-headers" };
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNumber) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: "stale-timestamp" };
  }

  const expected = `${SIGNATURE_VERSION}=` +
    createHmac("sha256", signingSecret)
      .update(`${SIGNATURE_VERSION}:${timestamp}:${rawBody}`)
      .digest("hex");

  // timingSafeEqual requires equal-length buffers — guard first.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return { ok: false, reason: "bad-signature" };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }
  return { ok: true };
}
