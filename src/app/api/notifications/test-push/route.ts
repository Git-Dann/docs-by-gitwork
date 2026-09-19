// POST /api/notifications/test-push
//
// Sends a notification to the CALLER'S OWN phones, and reports what happened.
//
// It exists because a push that does not arrive is silent in every direction: the
// phone shows nothing whether APNs is unconfigured, the user has no registered
// device, the token is dead, or Apple rejected it. That ambiguity is what made iOS
// push look "flaky" when in fact no device had ever registered — registration needs
// the per-user JWT, and the sign-in exchange that mints it had never succeeded.
//
// ⚠️ Self-only, deliberately. Taking a `userId` would turn a diagnostic into a way to
// ring a colleague's phone on demand, which is exactly what this workspace is trying
// to avoid — a phone is opt-in per event, not a button anyone can press at someone.

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { isApnsConfigured } from "@/server/push/apns";
import { listActiveDeviceTokensForUser } from "@/server/push/devices";
import { sendFoundryNotificationPush } from "@/server/push/notifications";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);

    // Report the two "nothing to do" cases distinctly rather than as a generic
    // failure — they have completely different fixes.
    if (!isApnsConfigured()) {
      return apiOk({
        sent: 0,
        outcome: "apns_not_configured",
        detail:
          "APNs is not configured on this server (APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID / the .p8 key).",
      });
    }

    const devices = await listActiveDeviceTokensForUser(user.id);
    if (devices.length === 0) {
      return apiOk({
        sent: 0,
        outcome: "no_devices",
        detail:
          "No phone is registered to your account. Open the Foundry app and sign in with Google — registration happens on sign-in.",
      });
    }

    const result = await sendFoundryNotificationPush({
      userId: user.id,
      title: "Foundry test",
      body: "If you can see this, notifications are reaching your phone.",
      actionUrl: "/app",
      collapseId: `test:${user.id}`,
    });

    if (result.sent > 0) {
      return apiOk({
        sent: result.sent,
        failed: result.failed,
        devices: devices.length,
        outcome: "sent",
        detail: `Sent to ${result.sent} of ${devices.length} device(s).`,
      });
    }

    // ⚠️ Whose fault it is matters more than that it failed, and the first version of
    // this got it wrong: it reported every failure as a dead device token and told the
    // user to sign in again. The actual failure was InvalidProviderToken — Apple
    // rejecting THIS SERVER's APNs key — so the advice sent someone to reinstall an app
    // that was working perfectly. Reporting "we could not look" as "it is not there"
    // again, one layer out.
    const providerFault = result.reasons.some((r) =>
      ["InvalidProviderToken", "ExpiredProviderToken", "BadTopic", "TopicDisallowed", "NotConfigured"].includes(r),
    );
    const transient = result.reasons.some((r) =>
      ["TooManyRequests", "ServiceUnavailable", "InternalServerError", "NetworkError"].includes(r),
    );

    return apiOk({
      sent: 0,
      failed: result.failed,
      devices: devices.length,
      reasons: result.reasons,
      outcome: providerFault ? "server_credentials" : transient ? "transient" : "dead_tokens",
      detail: providerFault
        ? `Apple rejected this server's APNs credentials (${result.reasons.join(", ")}). Your phone is fine — the APNs key, Key ID or Team ID on the server needs fixing.`
        : transient
          ? `Apple was temporarily unavailable (${result.reasons.join(", ")}). Try again shortly.`
          : "Every device token was rejected as dead. They are cleared automatically — sign in on the app again to re-register.",
    });
  } catch (error) {
    return fromError(error);
  }
}
