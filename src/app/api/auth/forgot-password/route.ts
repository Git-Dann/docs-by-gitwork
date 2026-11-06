import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requestPasswordReset } from "@/server/auth/password-reset";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";

/**
 * POST /api/auth/forgot-password { email } — emails a single-use reset link
 * (src/server/auth/password-reset.ts). Always answers the same, so it can't be used to
 * find accounts. There is no shared recovery key any more.
 */
const schema = z.object({ email: z.string().trim().email() });

export async function POST(req: NextRequest) {
  try {
    const { email } = schema.parse(await req.json());
    const ip = clientIpFrom(req.headers) ?? "unknown";
    await assertWithinRateLimit({ bucket: `password-reset:ip:${ip}`, max: 10, windowMs: 60 * 60 * 1000 });
    await assertWithinRateLimit({ bucket: `password-reset:email:${email.toLowerCase()}`, max: 3, windowMs: 60 * 60 * 1000 });
    await requestPasswordReset(email);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
