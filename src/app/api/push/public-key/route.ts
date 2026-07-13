/** GET /api/push/public-key → { enabled, publicKey }. The browser needs the VAPID
 *  public key to create a subscription; it's public by design. `enabled` is false
 *  when no VAPID keys are configured, so the UI can hide the push toggle. */

import { apiOk, fromError } from "@/lib/api-response";
import { isWebPushEnabled, webPushPublicKey } from "@/server/web-push";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk({ enabled: isWebPushEnabled(), publicKey: webPushPublicKey() });
  } catch (e) {
    return fromError(e);
  }
}
