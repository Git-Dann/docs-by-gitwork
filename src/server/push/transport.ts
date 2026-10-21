/**
 * transport.ts — getting one payload onto N phones, whoever owns them.
 *
 * Extracted from `notifications.ts` when clients got phones of their own. Staff
 * devices hang off `DeviceToken` (a `User`); client devices hang off
 * `ClientDeviceToken` (a `ClientWikiUser`). Two tables, two sets of mutators —
 * and exactly ONE copy of the part that is hard to get right.
 *
 * ⚠️ WHAT MUST NOT BE DUPLICATED, and why. The dual-gateway retry below exists
 * because the environment a token belongs to is SELF-REPORTED by the app and has
 * already been wrong in production: the iOS build matched its provisioning
 * profile's `aps-environment` against a string with one tab where real profiles
 * use two, so every build reported "sandbox", production tokens were sent to the
 * sandbox gateway, Apple answered BadDeviceToken, and perfectly good devices were
 * soft-deleted as dead. A second copy of this logic is a second place for that
 * class of bug to live, in the path that is hardest to notice is broken — nobody
 * reports a notification that silently never arrives.
 *
 * So a new audience supplies a `DeviceStore`: where its rows live and how to mark
 * one used, failed, or mis-addressed. It does not supply its own sending.
 */

import {
  sendApns,
  type ApnsFailureReason,
  type ApnsPayload,
  type ApnsSendResult,
} from "./apns";

export type ApnsEnvironment = "sandbox" | "production";

/**
 * Narrows the environment string a row happens to hold.
 *
 * Both token tables store it as free text, because it is self-reported by the app
 * at registration and the database is not the place to discover that the app lied.
 *
 * ⚠️ The fallback is deliberately unimportant, and that is the point: an
 * unrecognised value costs ONE failed round trip, after which the retry below finds
 * the right gateway and writes the correction back. Guessing here is safe precisely
 * because nothing downstream trusts the guess.
 */
export function asApnsEnvironment(value: string): ApnsEnvironment {
  return value === "production" ? "production" : "sandbox";
}

/** The only fields the transport needs. Both token tables satisfy it. */
export interface PushableDevice {
  id: string;
  token: string;
  environment: string;
  /** Owner, for log lines only — never used to decide anything. */
  ownerId: string;
}

/**
 * How to write back to whichever table the device came from.
 *
 * ⚠️ All three are REQUIRED, not optional. An audience that omitted
 * `correctEnvironment` would keep paying a failed round trip on every single send
 * forever, and would do it silently — which is precisely the bug this file's
 * header is about, re-introduced through a convenience default.
 */
export interface DeviceStore {
  markUsed(token: string): Promise<void>;
  markFailed(token: string): Promise<void>;
  correctEnvironment(token: string, environment: string): Promise<void>;
}

export interface FanOutResult {
  sent: number;
  failed: number;
  skipped: boolean;
  reasons: ApnsFailureReason[];
}

/**
 * Sends to one device, and on `BadDeviceToken` retries the OTHER APNs gateway once.
 *
 * A token is only declared dead when BOTH gateways reject it, which is the only
 * evidence that actually means dead. When the other one accepts it, the stored
 * environment is corrected so the next send goes straight there.
 */
async function sendToDevice(
  device: PushableDevice,
  store: DeviceStore,
  payload: ApnsPayload,
  collapseId: string,
): Promise<ApnsSendResult> {
  const declared = asApnsEnvironment(device.environment);
  const first = await sendApns({
    deviceToken: device.token,
    environment: declared,
    payload,
    collapseId,
  });
  if (first.ok || first.reason !== "BadDeviceToken") return first;

  const other: ApnsEnvironment = declared === "production" ? "sandbox" : "production";
  const retry = await sendApns({
    deviceToken: device.token,
    environment: other,
    payload,
    collapseId,
  });
  if (retry.ok) {
    await store.correctEnvironment(device.token, other);
    console.warn(
      `[push] device ${device.id} was registered as ${declared} but is ${other} — corrected`,
    );
  }
  return retry;
}

async function handleResult(
  device: PushableDevice,
  store: DeviceStore,
  result: ApnsSendResult,
): Promise<void> {
  if (result.ok) {
    await store.markUsed(device.token);
    return;
  }

  // Soft-delete only on definitive "this token is dead" responses. Transient
  // errors (TooManyRequests, ServiceUnavailable, NetworkError) leave the token
  // alone for the next attempt.
  switch (result.reason) {
    case "BadDeviceToken":
    case "Unregistered":
    case "DeviceTokenNotForTopic":
      await store.markFailed(device.token);
      console.warn(
        `[push] soft-deleted device ${device.id} for owner ${device.ownerId}: ${result.reason} (status ${result.status})`,
      );
      break;
    case "BadTopic":
    case "TopicDisallowed":
    case "InvalidProviderToken":
    // ⚠️ NOT transient. Retrying re-sends the identical oversized payload, so it
    // fails forever — and `shrinkToFit` should have made it unreachable, which
    // makes seeing it a bug report, not a blip.
    case "PayloadTooLarge":
      // Configuration issue — log loudly but don't kill the device row. The
      // tokens are fine; our environment is wrong.
      console.error(`[push] APNs configuration error: ${result.reason} (status ${result.status})`);
      break;
    default:
      console.warn(
        `[push] transient APNs failure for device ${device.id}: ${result.reason} (status ${result.status})`,
      );
  }
}

/**
 * Sends one payload to every given device, in parallel, isolating failures.
 *
 * A dead token on one phone must never stop delivery to another, so each send is
 * independent and the per-device write-back happens next to its own result.
 *
 * ⚠️ The failure REASONS travel with the counts, and that is load-bearing.
 * Collapsing them to "it failed" is what once let a server-side credential problem
 * (`InvalidProviderToken` — our own APNs key rejected by Apple) be reported to a
 * user as a dead device, sending them to reinstall an app that was working.
 */
export async function fanOutToDevices(
  devices: PushableDevice[],
  store: DeviceStore,
  payload: ApnsPayload,
  collapseId: string,
): Promise<FanOutResult> {
  if (devices.length === 0) return { sent: 0, failed: 0, skipped: true, reasons: [] };

  const results = await Promise.all(
    devices.map(async (device) => {
      const result = await sendToDevice(device, store, payload, collapseId);
      await handleResult(device, store, result);
      return result;
    }),
  );

  const sent = results.filter((r) => r.ok).length;
  const reasons = [...new Set(results.flatMap((r) => (r.ok ? [] : [r.reason])))];
  return { sent, failed: results.length - sent, skipped: false, reasons };
}
