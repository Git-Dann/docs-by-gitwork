import { after, NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertScannableUrl } from "@/server/pulse-lite/url-guard";
import { assertWithinLiteScanQuota, clientIpFrom, rateLimitHeaders, retryAfterHeaders, RateLimitedError } from "@/server/pulse-lite/rate-limit";
import { runPublicLiteScan } from "@/server/pulse-lite/public-scan";
import { PulseEmbedDisabledError } from "@/server/pulse-lite/kill-switch";
import { assertValidTurnstileToken } from "@/server/pulse-lite/turnstile";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // lite scan (no PageSpeed) finishes well within this

const LITE_SCAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /api/public/pulse/scan  (PUBLIC — no API key)
 * Body: { url, source?, honeypot?, turnstileToken? }.
 *
 * ── Email is OPTIONAL ────────────────────────────────────────────────────────
 * The facts are not the gate. A scan costs nothing to run — `pulse-lite/*` imports
 * no AI module, the headless browser and PageSpeed are both off on this path, and no
 * external quota is touched — so requiring contact details before showing a visitor
 * anything only shrinks the top of the funnel while giving away less than the
 * competition does for free.
 *
 * What converts is the INTERPRETATION: "what this means", the prioritised roadmap,
 * the fix brief and the ~600-item advisory tail. That is where the token cost and the
 * expertise sit, and it is gated behind POST /api/public/pulse/scan/[id]/enquiry.
 *
 * An email sent here is IGNORED. It used to capture a lead and unlock the report on the
 * spot, which would let anyone skip the unlock form (name, business, terms). Unlocking
 * happens only through the enquiry endpoint.
 *
 * Order is cheapest-first: kill-switch → honeypot → Turnstile →
 * SSRF guard → rate limit. Abuse is bounded by Turnstile plus the per-IP and
 * per-host quotas, which is where it always actually was — the email requirement was
 * doing lead-scarcity work, not security work.
 */
export async function POST(request: NextRequest) {
  try {
    // Cheapest checks first: kill-switch → honeypot → Turnstile → SSRF-guard/rate-limit.
    const config = await getPulseEmbedWorkspaceConfig();
    if (!config.enabled) throw new PulseEmbedDisabledError();

    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      source?: string;
      honeypot?: string;
      turnstileToken?: string;
    };

    if (body.honeypot) return apiError("Couldn't start the scan.", 400);

    const ip = clientIpFrom(request.headers);
    await assertValidTurnstileToken(body.turnstileToken, ip, config.turnstileSecretKey);

    // SSRF guard + normalisation (throws 400 on unsafe input).
    const { url, hostname } = await assertScannableUrl(body.url ?? "");

    // Abuse protection (throws 429 when over quota). Also bounds TOTAL concurrency,
    // which nothing did before: per-IP caps limit one actor, not a stampede — and the
    // same container serves the authenticated app.
    const quota = await assertWithinLiteScanQuota({ ip, targetHost: hostname });

    const lite = await prisma.pulseLiteScan.create({
      data: {
        targetUrl: url,
        targetHost: hostname,
        ip,
        status: "RUNNING",
        expiresAt: new Date(Date.now() + LITE_SCAN_TTL_MS),
      },
      select: { id: true },
    });

    after(() => runPublicLiteScan(lite.id, url));

    // Advertise the limit we actually enforce. Pulse WARNS every site it scans for
    // not doing this; sending none of its own was the plainest hypocrisy in the audit.
    return apiOk({ id: lite.id }, { status: 201, headers: rateLimitHeaders(quota) });
  } catch (error) {
    // A 429 without Retry-After tells a client nothing except "no" — which is
    // exactly the complaint api-behaviour.ts raises against scanned sites.
    if (error instanceof RateLimitedError) {
      const res = fromError(error);
      for (const [k, v] of Object.entries(retryAfterHeaders())) res.headers.set(k, v);
      return res;
    }
    return fromError(error);
  }
}
