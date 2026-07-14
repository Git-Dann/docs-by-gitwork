import { after, NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertScannableUrl } from "@/server/pulse-lite/url-guard";
import { assertWithinLiteScanQuota, clientIpFrom } from "@/server/pulse-lite/rate-limit";
import { runPublicLiteScan } from "@/server/pulse-lite/public-scan";
import { PulseEmbedDisabledError } from "@/server/pulse-lite/kill-switch";
import { assertValidTurnstileToken } from "@/server/pulse-lite/turnstile";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // lite scan (no PageSpeed) finishes well within this

const LITE_SCAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /api/public/pulse/scan  (PUBLIC — no API key)
 * Body: { url }. Validates (SSRF guard), rate-limits per IP/host, creates a
 * PulseLiteScan and runs the AI-free scan in the background. Returns { id }.
 */
export async function POST(request: NextRequest) {
  try {
    // Cheapest checks first: kill-switch → honeypot → Turnstile → SSRF-guard/rate-limit.
    const config = await getPulseEmbedWorkspaceConfig();
    if (!config.enabled) throw new PulseEmbedDisabledError();

    const body = (await request.json().catch(() => ({}))) as { url?: string; honeypot?: string; turnstileToken?: string };

    if (body.honeypot) return apiError("Couldn't start the scan.", 400);

    const ip = clientIpFrom(request.headers);
    await assertValidTurnstileToken(body.turnstileToken, ip, config.turnstileSecretKey);

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

    after(() => runPublicLiteScan(lite.id, url));

    return apiOk({ id: lite.id }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
