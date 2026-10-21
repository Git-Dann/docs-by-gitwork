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
  APNS_MAX_PAYLOAD_BYTES,
} from "./apns";
import {
  fanOutToDevices,
  type DeviceStore,
  type FanOutResult,
} from "./transport";
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
        title: fitTitle(input.title),
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

  return await fanOut(devices, shrinkToFit(payload), input.collapseId);
}

/**
 * Caps the alert title so a long one cannot crowd out the body.
 *
 * iOS shows roughly a line of title on a banner regardless, so anything beyond this is
 * bytes spent on text nobody reads — and those bytes are the ones that push a payload
 * over the limit.
 */
export function fitTitle(title: string): string {
  return title.length > 120 ? `${title.slice(0, 119)}…` : title;
}

/**
 * Shortens the alert body until the whole payload fits APNs' size limit.
 *
 * ⚠️ APNs does NOT truncate an oversized payload — it refuses it with 413 and the
 * notification is never delivered. Today every caller already passes a short preview,
 * so nothing reaches this; it exists because the day someone passes a full message
 * body instead, the failure is a push that silently never arrives, which is the single
 * hardest thing to notice in this whole system.
 *
 * Trims by CODE POINT and measures in BYTES: slicing a JavaScript string by index can
 * cut a surrogate pair in half, and one emoji is four bytes, so a character count is
 * the wrong unit twice over.
 */
export function shrinkToFit(payload: ApnsPayload): ApnsPayload {
  if (payloadBytes(payload) <= APNS_MAX_PAYLOAD_BYTES) return payload;

  const alert = payload.aps.alert;
  if (typeof alert !== "object" || !alert?.body) {
    // Nothing safely trimmable. Let it go and be rejected loudly rather than
    // silently dropping a field a caller deliberately set.
    console.error("[push] payload exceeds the APNs limit and has no trimmable body");
    return payload;
  }

  const points = Array.from(alert.body);
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = withBody(payload, `${points.slice(0, mid).join("")}…`);
    if (payloadBytes(candidate) <= APNS_MAX_PAYLOAD_BYTES) lo = mid;
    else hi = mid - 1;
  }
  console.warn(`[push] trimmed an oversized alert body to ${lo} characters to fit APNs`);
  return withBody(payload, `${points.slice(0, lo).join("")}…`);
}

function withBody(payload: ApnsPayload, body: string): ApnsPayload {
  const alert = payload.aps.alert;
  if (typeof alert !== "object" || !alert) return payload;
  return { ...payload, aps: { ...payload.aps, alert: { ...alert, body } } };
}

function payloadBytes(payload: ApnsPayload): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
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
 * The staff audience's write-backs. The sending itself — including the
 * dual-gateway retry and the environment correction — lives in `transport.ts`,
 * shared with the client-device path. See that file's header for why there is
 * exactly one copy of it.
 */
const staffDeviceStore: DeviceStore = {
  markUsed: markDeviceTokenUsed,
  markFailed: markDeviceTokenFailed,
  correctEnvironment: correctDeviceEnvironment,
};

async function fanOut(
  devices: DeviceTokenRecord[],
  payload: ApnsPayload,
  collapseId: string,
): Promise<FanOutResult> {
  return await fanOutToDevices(
    devices.map((d) => ({
      id: d.id,
      token: d.token,
      environment: d.environment,
      ownerId: d.userId,
    })),
    staffDeviceStore,
    payload,
    collapseId,
  );
}
