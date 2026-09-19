// High-level push notification senders. Wraps the APNs client + device
// registry with notification-specific payload building and audience selection.
//
// Design:
//   • Each public function takes a domain object (PulseScan), figures out who
//     to notify, builds the APNs payload, and fans out per device.
//   • Failures are isolated per device — a BadDeviceToken on one device must
//     not block delivery to the user's other devices.
//   • Soft-deletes (failedAt) happen here, not in apns.ts, so failure handling
//     stays close to the persistence layer.
//   • All sends are best-effort: the calling code path (e.g. scan completion
//     write) must not throw if push fails. Wrap any call site in try/catch
//     and log the failure.

import {
  isApnsConfigured,
  sendApns,
  type ApnsFailureReason,
  type ApnsPayload,
  type ApnsSendResult,
} from "./apns";
import {
  listActiveDeviceTokensForUser,
  listActiveDeviceTokensForWorkspace,
  markDeviceTokenFailed,
  markDeviceTokenUsed,
  correctDeviceEnvironment,
  type DeviceTokenRecord,
} from "./devices";

// ─── Public senders ─────────────────────────────────────────────────────────

export type FoundryNotificationPushInput = {
  userId: string;
  title: string;
  body: string | null;
  /** In-app path the tap should open, e.g. "/app/portal/wedge". */
  actionUrl: string | null;
  /** Collapses repeats of the same grouped notification into one phone alert. */
  collapseId: string;
};

/**
 * Sends one in-app notification to a user's phones.
 *
 * This is the bridge that was missing: `dispatchNotification` could reach the bell and
 * the browser, while APNs was wired only for Pulse scans. Every other event — a task
 * assigned, a client request, the Foreman digest — stopped at the browser, so the
 * Foundry app on a phone had never received a notification of any kind.
 *
 * ⚠️ Delivery is gated by the **`mobile`** channel, not `push`. See the note on
 * `NOTIFICATION_CHANNELS`: reusing `push` would have made every already-routed event
 * ring a phone. Being on this path at all means someone listed the event explicitly.
 *
 * Best-effort like every other sender here — the caller must not fail because a push did.
 */
export async function sendFoundryNotificationPush(
  input: FoundryNotificationPushInput,
): Promise<{ sent: number; failed: number; skipped: boolean; reasons: ApnsFailureReason[] }> {
  if (!isApnsConfigured()) return { sent: 0, failed: 0, skipped: true, reasons: [] };

  const devices = await listActiveDeviceTokensForUser(input.userId);
  if (devices.length === 0) return { sent: 0, failed: 0, skipped: true, reasons: [] };

  const payload: ApnsPayload = {
    aps: {
      alert: {
        title: input.title,
        ...(input.body ? { body: input.body } : {}),
      },
      sound: "default",
      "thread-id": input.collapseId,
    },
    // Custom keys arrive as userInfo. `kind` tells the app how to read the rest —
    // the Pulse pushes send `kind: "scan"` + `scanId`, so a generic destination needs
    // its own kind rather than overloading theirs.
    kind: "notification",
    ...(input.actionUrl ? { path: input.actionUrl } : {}),
  };

  return await fanOut(devices, payload, input.collapseId);
}


export type PulseScanCompletedInput = {
  scanId: string;
  workspaceId: string;
  triggeredByUserId: string | null;
  projectName: string;
  healthScore: number | null;
  previousHealthScore: number | null;
  failedCheckCount: number;
};

/**
 * "Acme Health: 87/100 · 5 issues found" → tap → PulseScanDetailView.
 *
 * Audience selection:
 *   • triggeredByUserId set (user kicked it from iOS or web) → just that user
 *   • triggeredByUserId null (monitor/webhook scan) → every workspace member
 */
export async function sendPulseScanCompletedPush(
  input: PulseScanCompletedInput,
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!isApnsConfigured()) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const devices = await resolveAudience(input.triggeredByUserId, input.workspaceId);
  if (devices.length === 0) {
    return { sent: 0, failed: 0, skipped: false };
  }

  const payload: ApnsPayload = {
    aps: {
      alert: {
        title: input.projectName,
        body: buildScanCompletedBody(input.healthScore, input.failedCheckCount),
      },
      sound: "default",
      "thread-id": `pulse-${input.workspaceId}`,
      "mutable-content": 1,
    },
    // Custom user-info — read by iOS to deep-link to the scan detail view.
    scanId: input.scanId,
    notificationType: "pulse.scan.completed",
    healthScore: input.healthScore,
    previousHealthScore: input.previousHealthScore,
  };

  return await fanOut(devices, payload, `pulse-scan-${input.scanId}`);
}

export type PulseScanFailedInput = {
  scanId: string;
  workspaceId: string;
  triggeredByUserId: string | null;
  projectName: string;
  errorMessage: string | null;
};

export async function sendPulseScanFailedPush(
  input: PulseScanFailedInput,
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!isApnsConfigured()) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const devices = await resolveAudience(input.triggeredByUserId, input.workspaceId);
  if (devices.length === 0) {
    return { sent: 0, failed: 0, skipped: false };
  }

  const payload: ApnsPayload = {
    aps: {
      alert: {
        title: `${input.projectName} — scan failed`,
        body: input.errorMessage?.slice(0, 200) ?? "The scan didn't complete. Tap to see details.",
      },
      sound: "default",
      "thread-id": `pulse-${input.workspaceId}`,
    },
    scanId: input.scanId,
    notificationType: "pulse.scan.failed",
  };

  return await fanOut(devices, payload, `pulse-scan-${input.scanId}`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildScanCompletedBody(score: number | null, failedCheckCount: number): string {
  const scorePart = score === null ? "Scan complete" : `${score}/100`;
  if (failedCheckCount === 0) return `${scorePart} · No issues found`;
  if (failedCheckCount === 1) return `${scorePart} · 1 issue found`;
  return `${scorePart} · ${failedCheckCount} issues found`;
}

async function resolveAudience(
  triggeredByUserId: string | null,
  workspaceId: string,
): Promise<DeviceTokenRecord[]> {
  if (triggeredByUserId) {
    return await listActiveDeviceTokensForUser(triggeredByUserId);
  }
  return await listActiveDeviceTokensForWorkspace(workspaceId);
}

/**
 * Sends to one device, and on `BadDeviceToken` retries the OTHER APNs gateway once.
 *
 * ⚠️ A device token is only valid on the gateway it was minted for, and the CLIENT
 * decides which environment it reports at registration — from a value it infers, which
 * it can get wrong. It did: the iOS app matched the provisioning profile's
 * `aps-environment` with an exact string requiring a single tab, while real profiles
 * use two, so the match always failed and every build fell back to reporting
 * "sandbox". A production build's token then went to the sandbox gateway, Apple said
 * BadDeviceToken, and the row was soft-deleted as dead — when it was perfectly good and
 * merely sent to the wrong address.
 *
 * Trusting the client's self-report is the fragile part, so this stops depending on it:
 * if the other gateway accepts the token, the send succeeded and the stored environment
 * is corrected, so the next send goes straight there. A token is only declared dead when
 * BOTH gateways reject it, which is the only evidence that actually means dead.
 */
async function sendToDevice(
  device: DeviceTokenRecord,
  payload: ApnsPayload,
  collapseId: string,
): Promise<ApnsSendResult> {
  const first = await sendApns({
    deviceToken: device.token,
    environment: device.environment,
    payload,
    collapseId,
  });
  if (first.ok || first.reason !== "BadDeviceToken") return first;

  const other = device.environment === "production" ? "sandbox" : "production";
  const retry = await sendApns({
    deviceToken: device.token,
    environment: other,
    payload,
    collapseId,
  });
  if (retry.ok) {
    await correctDeviceEnvironment(device.token, other);
    console.warn(
      `[push] device ${device.id} was registered as ${device.environment} but is ${other} — corrected`,
    );
  }
  return retry;
}

async function fanOut(
  devices: DeviceTokenRecord[],
  payload: ApnsPayload,
  collapseId: string,
): Promise<{ sent: number; failed: number; skipped: boolean; reasons: ApnsFailureReason[] }> {
  // Parallel send — APNs handles concurrent connections fine, and each open
  // HTTP/2 session is independent. For a 2-3 person team this is <10 devices
  // typically; we'd batch differently at higher fan-out.
  const results = await Promise.all(
    devices.map(async (device) => {
      const result = await sendToDevice(device, payload, collapseId);
      await handleResult(device, result);
      return result;
    }),
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  // The reason has to travel with the counts. Collapsing every failure to "it failed"
  // is what let a SERVER credential problem (InvalidProviderToken — our own APNs key
  // rejected by Apple) be reported to the user as a dead device token, sending them to
  // re-install the app when nothing about their phone was wrong.
  const reasons = [...new Set(results.flatMap((r) => (r.ok ? [] : [r.reason])))];
  return { sent, failed, skipped: false, reasons };
}

async function handleResult(device: DeviceTokenRecord, result: ApnsSendResult): Promise<void> {
  if (result.ok) {
    await markDeviceTokenUsed(device.token);
    return;
  }

  // Soft-delete only on definitive "this token is dead" responses.
  // Transient errors (TooManyRequests, ServiceUnavailable, NetworkError) leave
  // the token alone for the next attempt.
  switch (result.reason) {
    case "BadDeviceToken":
    case "Unregistered":
    case "DeviceTokenNotForTopic":
      await markDeviceTokenFailed(device.token);
      console.warn(
        `[push] soft-deleted device ${device.id} for user ${device.userId}: ${result.reason} (status ${result.status})`,
      );
      break;
    case "BadTopic":
    case "TopicDisallowed":
    case "InvalidProviderToken":
      // Configuration issue — log loudly but don't kill the device row, the
      // tokens themselves are fine, our env is wrong.
      console.error(
        `[push] APNs configuration error: ${result.reason} (status ${result.status})`,
      );
      break;
    default:
      console.warn(
        `[push] transient APNs failure for device ${device.id}: ${result.reason} (status ${result.status})`,
      );
  }
}
