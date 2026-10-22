import { NextRequest, after } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { assertScannableUrl } from "@/server/pulse-lite/url-guard";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().url().optional() });

/**
 * POST /api/workspace/pulse-embed/sample-report
 *
 * Sends the caller the email a visitor gets after unlocking their scan, for a site of
 * their choosing (gitwork.co.uk by default): a full scan, then the summary email with the
 * link to the report PDF. Same code path as a real unlock, so what arrives is what a
 * customer gets. Admins only, and only ever to the caller.
 *
 * The scan takes a few minutes, so this answers straight away and the email follows.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertAtLeastAdmin(user);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const targetUrl = body.url ?? "https://gitwork.co.uk/";
    try {
      await assertScannableUrl(targetUrl);
    } catch (e) {
      return apiError(e instanceof Error ? e.message : "That URL can't be scanned.", 400);
    }

    after(async () => {
      const { deliverFullReport } = await import("@/server/pulse-lite/report-delivery");
      const res = await deliverFullReport({ to: user.email, name: user.name, targetUrl });
      if (!res.ok) console.error(`[pulse] sample report to ${user.email} not sent: ${res.error}`);
    });
    return apiOk({ queued: true, to: user.email, targetUrl });
  } catch (error) {
    return fromError(error);
  }
}
