import { after, NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertScannableUrl } from "@/server/pulse-lite/url-guard";
import { assertWithinLiteScanQuota, clientIpFrom, rateLimitHeaders, retryAfterHeaders, RateLimitedError } from "@/server/pulse-lite/rate-limit";
import { runPublicLiteScan } from "@/server/pulse-lite/public-scan";
import { capturePulseLead } from "@/server/pulse-lite/leads";
import { PulseEmbedDisabledError } from "@/server/pulse-lite/kill-switch";
import { assertValidTurnstileToken } from "@/server/pulse-lite/turnstile";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // lite scan (no PageSpeed) finishes well within this

const LITE_SCAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KNOWN_SOURCES = new Set(["gitwork.co.uk", "foundry-demo"]);

/**
 * POST /api/public/pulse/scan  (PUBLIC — no API key)
 * Body: { url, email? }.
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
 * Passing an email here still works and behaves exactly as before (captures the lead
 * immediately, enforcing one free scan per address), so the previous widget contract
 * is unbroken.
 *
 * Order is cheapest-first: kill-switch → honeypot → Turnstile → email (if given) →
 * SSRF guard → rate limit. Abuse is bounded by Turnstile plus the per-IP and
 * per-host quotas, which is where it always actually was — the email requirement was
 * doing lead-scarcity work, not security work.
 */
export async function POST(request: NextRequest) {
  try {
    // Cheapest checks first: kill-switch → honeypot → Turnstile → email → SSRF-guard/rate-limit.
    const config = await getPulseEmbedWorkspaceConfig();
    if (!config.enabled) throw new PulseEmbedDisabledError();

    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      email?: string;
      source?: string;
      honeypot?: string;
      turnstileToken?: string;
    };

    if (body.honeypot) return apiError("Couldn't start the scan.", 400);

    const ip = clientIpFrom(request.headers);
    await assertValidTurnstileToken(body.turnstileToken, ip, config.turnstileSecretKey);

    // Only validated when supplied. An absent email is the normal path now.
    const rawEmail = (body.email ?? "").trim().toLowerCase();
    const email = rawEmail.length > 0 ? rawEmail : null;
    if (email !== null) {
      if (!EMAIL_RE.test(email) || email.length > 200) {
        return apiError("Enter a valid email address.", 400);
      }
      // Fail fast — don't burn a scan on an email that can't convert anyway.
      const existingForEmail = await prisma.pulseLead.findFirst({ where: { email }, select: { id: true } });
      if (existingForEmail) return apiError("This email has already used its free scan.", 409);
    }

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

    const source = body.source && KNOWN_SOURCES.has(body.source) ? body.source : undefined;
    if (email !== null) await capturePulseLead({ liteScanId: lite.id, email, source });

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
