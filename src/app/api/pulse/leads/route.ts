import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listPulseLeads } from "@/server/pulse-lite/leads-admin";
import { assertInternal, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/pulse/leads — the email addresses captured by the public scanner.
 *
 * ⚠️ This used to be commented "authed" and enforce nothing beyond the middleware's
 * session check. That was the same thing while every account was a Gitwork Google
 * sign-in; with GUEST it meant an outside collaborator could read every lead's email
 * address with one request. Third-party personal data, so it is internal-only.
 */
export async function GET(request: NextRequest) {
  try {
    assertInternal(await getEffectiveUserOrNull(request));
    const leads = await listPulseLeads();
    return apiOk({ leads });
  } catch (error) {
    return fromError(error);
  }
}
