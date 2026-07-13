/** Web Push subscription management for the signed-in user.
 *  POST   → upsert a browser subscription ({ endpoint, keys: { p256dh, auth } }).
 *  DELETE → remove a subscription by { endpoint } (unsubscribe on this device). */

import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
    if (!endpoint || !p256dh || !auth) return apiError("Invalid push subscription", 400);

    const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
    await prisma.webPushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh, auth, userAgent },
      // Re-subscribing (or a subscription that migrated to another user on a shared
      // browser) rebinds to the current user and clears any dead flag.
      update: { userId: user.id, p256dh, auth, userAgent, failedAt: null, lastUsedAt: new Date() },
    });
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (endpoint) {
      await prisma.webPushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    }
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
