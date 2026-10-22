import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { escapeHtml, sendWorkspaceEmail } from "@/server/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/settings/integrations/test-email
 *
 * Sends one email through the saved outbound settings, to the person who pressed the
 * button. Admins only, and never to an address from the request, so the route cannot be
 * used to send mail to anyone else.
 *
 * Exists because a misconfigured provider fails silently everywhere else: callers send
 * fire-and-forget, so the first sign of a wrong password used to be a customer saying
 * the email never came.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertAtLeastAdmin(user);
    const result = await sendWorkspaceEmail({
      workspaceId: user.workspaceId,
      to: user.email,
      subject: "Foundry test email",
      html: `<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1A1A1E;">Hi ${escapeHtml(user.name ?? "there")},</p><p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1A1A1E;">Outbound email from Foundry is working. Pulse reports, document sends and notifications will go out through these settings.</p>`,
      text: "Outbound email from Foundry is working.",
    });
    if (!result.ok) return apiError(result.error, 400);
    return apiOk({ sent: true, to: user.email });
  } catch (error) {
    return fromError(error);
  }
}
