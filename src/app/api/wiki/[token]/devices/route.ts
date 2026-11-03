/**
 * Client-facing: a client registers (or unregisters) their phone for push.
 *
 * Posture mirrors the Launchpad writes — token AND the wiki-access cookie — not
 * the token-only reads. A read is "see what is being asked of you"; this says
 * "ring THIS handset with THIS client's delivery updates", and an anonymous
 * holder of a shared link must not be able to subscribe themselves to another
 * company's standups.
 *
 * ⚠️ Staff are deliberately NOT accepted here, unlike `resolveLaunchpadWriter`. A
 * Gitwork member's phone belongs on `/api/devices/register`, against their `User`.
 * Letting a staff session register a token on the CLIENT table would put a team
 * member's device inside a client's fan-out — and it would never be removed when
 * they left, because the leaver check lives on the staff table.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { isApnsConfigured } from "@/server/push/apns";
import {
  registerClientDeviceToken,
  unregisterClientDeviceToken,
} from "@/server/push/client-devices";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { resolveWikiIdByPublicToken } from "@/server/wiki";
import { resolveWikiAccessUser, wikiAccessCookieName } from "@/server/wiki-access";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  // Apple has changed the length before, so only the alphabet is enforced.
  token: z.string().regex(/^[a-fA-F0-9]+$/, "Device token must be hex"),
  environment: z.enum(["sandbox", "production"]),
  appBuild: z.string().max(64).optional().nullable(),
  appVersion: z.string().max(64).optional().nullable(),
});

const unregisterSchema = z.object({
  token: z.string().regex(/^[a-fA-F0-9]+$/, "Device token must be hex"),
});

/** Resolve the signed-in client user behind this share token, or null. */
async function resolveClientUser(req: NextRequest, token: string) {
  const wikiId = await resolveWikiIdByPublicToken(token);
  if (!wikiId) return null;
  const cookieValue = req.cookies.get(wikiAccessCookieName(wikiId))?.value;
  const user = await resolveWikiAccessUser(wikiId, cookieValue);
  if (!user) return null;
  return { wikiId, user };
}

// POST /api/wiki/[token]/devices — called by the app right after APNs hands it a
// token AND the client has signed in to their portal.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await assertWithinRateLimit({
      bucket: `wiki:devices:${clientIpFrom(req.headers) ?? "unknown"}`,
      max: 60,
      windowMs: 60_000,
      message: "Too many registrations — please wait a moment.",
    });

    const access = await resolveClientUser(req, token);
    if (!access) return apiError("Please sign in to your portal.", 401);

    const body = registerSchema.parse(await req.json());
    const record = await registerClientDeviceToken({
      clientWikiUserId: access.user.id,
      wikiId: access.wikiId,
      token: body.token,
      environment: body.environment,
      appBuild: body.appBuild ?? null,
      appVersion: body.appVersion ?? null,
    });

    return apiOk({
      device: {
        id: record.id,
        environment: record.environment,
        platform: record.platform,
        registeredAt: record.createdAt.toISOString(),
      },
      // If false the registration was stored but nothing will ever ring. Said
      // plainly so a silent non-delivery is diagnosable from the client side.
      apnsConfigured: isApnsConfigured(),
    });
  } catch (err) {
    return fromError(err);
  }
}

// DELETE /api/wiki/[token]/devices — explicit sign-out from the app.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const access = await resolveClientUser(req, token);
    if (!access) return apiError("Please sign in to your portal.", 401);

    const body = unregisterSchema.parse(await req.json());
    await unregisterClientDeviceToken(access.user.id, body.token);
    return apiOk({ removed: true });
  } catch (err) {
    return fromError(err);
  }
}
