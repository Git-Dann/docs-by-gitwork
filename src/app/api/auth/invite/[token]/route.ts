import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { acceptInviteWithPassword } from "@/server/team";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";

/**
 * POST /api/auth/invite/[token] { name, email, password } — accept an invite to a business
 * (not Gitwork) by creating an account with a password. Public: the invite token is the
 * credential, and an addressed invite only accepts its own email (src/lib/invite-rules.ts).
 */
const schema = z
  .object({
    name: z.string().trim().min(1, "Add your name").max(120),
    email: z.string().trim().email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters").max(200),
  })
  .strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const ip = clientIpFrom(req.headers) ?? "unknown";
    await assertWithinRateLimit({ bucket: `invite-signup:ip:${ip}`, max: 10, windowMs: 60 * 60 * 1000 });
    const body = schema.parse(await req.json());
    const result = await acceptInviteWithPassword({ token, ...body });
    if (!result.ok) return apiError(result.error, result.status);
    return apiOk({ ok: true, email: result.email });
  } catch (error) {
    return fromError(error);
  }
}
