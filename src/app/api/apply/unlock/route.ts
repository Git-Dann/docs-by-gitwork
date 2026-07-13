import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { APPLY_COOKIE, accessCookieValue, isAccessCookieValid, isPasswordCorrect } from "@/server/devsignal/apply";

export const dynamic = "force-dynamic";

const unlockSchema = z.object({ password: z.string().min(1).max(200) });

// GET — has this browser already unlocked? (cookie is HttpOnly, so JS asks us.)
export async function GET() {
  try {
    const jar = await cookies();
    return apiOk({ unlocked: isAccessCookieValid(jar.get(APPLY_COOKIE)?.value) });
  } catch (error) {
    return fromError(error);
  }
}

// POST — verify the shared password, set the access cookie.
export async function POST(request: NextRequest) {
  try {
    await assertWithinRateLimit({
      bucket: `apply:unlock:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 10,
      windowMs: 60_000,
      message: "Too many attempts — please wait a minute.",
    });
    const { password } = unlockSchema.parse(await request.json());
    if (!isPasswordCorrect(password)) return apiError("Incorrect access password.", 401);
    const jar = await cookies();
    jar.set(APPLY_COOKIE, accessCookieValue(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
