import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { completePasswordReset } from "@/server/auth/password-reset";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";

/** POST /api/auth/reset-password { token, newPassword } — uses an emailed reset link once. */
const schema = z.object({ token: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = schema.parse(await req.json());
    const ip = clientIpFrom(req.headers) ?? "unknown";
    await assertWithinRateLimit({ bucket: `password-reset-use:ip:${ip}`, max: 20, windowMs: 60 * 60 * 1000 });
    const result = await completePasswordReset(token, newPassword);
    if (!result.ok) return apiError(result.error, 400);
    return apiOk({ ok: true, email: result.email });
  } catch (error) {
    return fromError(error);
  }
}
