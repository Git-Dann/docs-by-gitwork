import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { APPLY_COOKIE, isAccessCookieValid, startPublicApplication } from "@/server/devsignal/apply";

export const dynamic = "force-dynamic";

const startSchema = z.object({
  name: z.string().trim().min(1, "Your name is required.").max(200),
  email: z.string().trim().email("Enter a valid email.").max(320),
  githubHandle: z
    .string()
    .trim()
    .min(1, "GitHub username is required.")
    .max(120)
    .regex(/^@?[a-zA-Z0-9-]+$/, "That doesn't look like a GitHub username."),
  primaryStack: z.string().trim().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await assertWithinRateLimit({
      bucket: `apply:start:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 6,
      windowMs: 60_000,
      message: "Too many attempts — please wait a minute.",
    });
    const jar = await cookies();
    if (!isAccessCookieValid(jar.get(APPLY_COOKIE)?.value)) {
      return apiError("Enter the access password first.", 401);
    }
    const body = startSchema.parse(await request.json());
    const origin = request.nextUrl.origin;
    const { token } = await startPublicApplication(
      {
        name: body.name,
        githubHandle: body.githubHandle.replace(/^@/, ""),
        email: body.email,
        primaryStack: body.primaryStack || undefined,
      },
      { origin },
    );
    if (!token) return apiError("Could not start the assessment.", 500);
    return apiOk({ token });
  } catch (error) {
    return fromError(error);
  }
}
