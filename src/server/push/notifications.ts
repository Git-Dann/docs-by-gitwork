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

import { isApnsConfigured, sendApns, type ApnsPayload, type ApnsSendResult } from "./apns";
import {
  listActiveDeviceTokensForUser,
  listActiveDeviceTokensForWorkspace,
  markDeviceTokenFailed,
  markDeviceTokenUsed,
  type DeviceTokenRecord,
} from "./devices";

// ─── Public senders ─────────────────────────────────────────────────────────

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

async function fanOut(
  devices: DeviceTokenRecord[],
  payload: ApnsPayload,
  collapseId: string,
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  // Parallel send — APNs handles concurrent connections fine, and each open
  // HTTP/2 session is independent. For a 2-3 person team this is <10 devices
  // typically; we'd batch differently at higher fan-out.
  const results = await Promise.all(
    devices.map(async (device) => {
      const result = await sendApns({
        deviceToken: device.token,
        environment: device.environment,
        payload,
        collapseId,
      });
      await handleResult(device, result);
      return result;
    }),
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  return { sent, failed, skipped: false };
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
