import { after, NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertScannableUrl } from "@/server/pulse-lite/url-guard";
import { assertWithinLiteScanQuota, clientIpFrom } from "@/server/pulse-lite/rate-limit";
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
 * Body: { url, email }. Email is required up front (not a later "unlock" step) —
 * validates it, rejects with 409 if it's already claimed its one lifetime free scan,
 * then validates the URL (SSRF guard), rate-limits per IP/host, creates a
 * PulseLiteScan + PulseLead together, and runs the AI-free scan in the background.
 * Notifications (team + visitor) fire once the scan actually completes — see
 * runPublicLiteScan / notifyLeadOfScanResult.
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

    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return apiError("Enter a valid email address.", 400);
    }
    // Fail fast — don't burn a scan on an email that can't unlock anyway.
    const existingForEmail = await prisma.pulseLead.findFirst({ where: { email }, select: { id: true } });
    if (existingForEmail) return apiError("This email has already used its free scan.", 409);

    // SSRF guard + normalisation (throws 400 on unsafe input).
    const { url, hostname } = await assertScannableUrl(body.url ?? "");

    // Abuse protection (throws 429 when over quota).
    await assertWithinLiteScanQuota({ ip, targetHost: hostname });

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
    await capturePulseLead({ liteScanId: lite.id, email, source });

    after(() => runPublicLiteScan(lite.id, url));

    return apiOk({ id: lite.id }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
