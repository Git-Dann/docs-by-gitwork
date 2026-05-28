import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { getRequestUser } from "@/server/auth/request-user";
import { registerDeviceToken } from "@/server/push/devices";
import { isApnsConfigured } from "@/server/push/apns";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  // APNs hex token — Apple emits 64–200+ char hex strings. We don't enforce a
  // specific length (Apple has changed it before) but we do enforce hex-only.
  token: z.string().regex(/^[a-fA-F0-9]+$/, "Device token must be hex"),
  environment: z.enum(["sandbox", "production"]),
  appBuild: z.string().optional().nullable(),
  appVersion: z.string().optional().nullable(),
});

// POST /api/devices/register
// Called by iOS immediately after `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`
// fires AND the user has signed in (so the request carries a valid mobile JWT).
//
// Requires per-user auth — we explicitly reject API_KEY (workspace) and
// unauthenticated calls so a stolen workspace key can't be used to bulk-write
// device tokens.
export async function POST(req: NextRequest) {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return apiError("Sign in required", 401);
    }

    const body = registerSchema.parse(await req.json());
    const record = await registerDeviceToken({
      userId: user.id,
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
      // Helpful diagnostic: if false, the server received the registration but
      // pushes won't actually fire until env is configured.
      apnsConfigured: isApnsConfigured(),
    });
  } catch (error) {
    return fromError(error);
  }
}
