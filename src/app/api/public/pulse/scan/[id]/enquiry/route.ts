import { after, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { honeypotTripped, parseCapture } from "@/lib/pulse-capture";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { capturePulseLead, notifyLeadOfScanResult } from "@/server/pulse-lite/leads";
import { clientIpFrom } from "@/server/pulse-lite/rate-limit";
import { PulseEmbedDisabledError } from "@/server/pulse-lite/kill-switch";
import { assertValidTurnstileToken } from "@/server/pulse-lite/turnstile";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";
import { isPulseScanSource } from "@/server/pulse-embed-config";

export const dynamic = "force-dynamic";

/**
 * POST /api/public/pulse/scan/[id]/enquiry  (PUBLIC — no API key)
 * Body: { name, business, email, termsAccepted: true, source?, honeypot?, turnstileToken? }
 *
 * The conversion point. A visitor has already seen the free report — the score, the
 * triaged P1/P2 findings with evidence, and what could not be established — and is
 * asking for the in-depth review: what it means for them, the prioritised order to
 * fix it in, the implementation brief, and the advisory tail.
 *
 * That is the half with real cost (AI tokens) and real expertise behind it, so this
 * is where contact details are asked for, rather than before the visitor has been
 * shown anything.
 *
 * Unlocking records the lead and emails the visitor their full report, which runs a
 * full scan with an AI pass (pulse-lite/report-delivery.ts). That is the one place an
 * anonymous caller spends tokens, so it is bounded several ways: Turnstile and the
 * honeypot here, the per-IP limits on starting a scan, one unlock per scan (claimed
 * atomically), one per email address, and a daily ceiling (FULL_REPORTS_PER_DAY).
 *
 * Same gate stack as starting a scan — kill-switch, honeypot, Turnstile — because
 * this is an unauthenticated write.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const config = await getPulseEmbedWorkspaceConfig();
    if (!config.enabled) throw new PulseEmbedDisabledError();

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      business?: string;
      email?: string;
      termsAccepted?: boolean;
      source?: string;
      honeypot?: string;
      turnstileToken?: string;
    };

    // Autofill can fill the hidden field with something the visitor also typed for real;
    // that is not a bot (honeypotTripped).
    if (honeypotTripped(body.honeypot, [body.name, body.business, body.email])) {
      return apiError("Couldn't send that enquiry.", 400);
    }

    const ip = clientIpFrom(request.headers);
    await assertValidTurnstileToken(body.turnstileToken, ip, config.turnstileSecretKey);

    // Name, business, email and agreement to the terms — all required. Recording the
    // moment they agreed is the point of asking.
    const parsed = parseCapture(body);
    if (!parsed.ok) return apiError(parsed.error, 400);
    const { name, business, email } = parsed.value;

    const source = isPulseScanSource(body.source) ? body.source : undefined;
    // capturePulseLead is idempotent per scan and throws EmailAlreadyUsedError (409)
    // for an address that has already been captured — `fromError` maps that status.
    const { leadId, created } = await capturePulseLead({
      liteScanId: id,
      email,
      name,
      business,
      source,
      termsAcceptedAt: new Date(),
    });

    // Send the full report now if the scan has finished (a scan still running notifies
    // from runPublicLiteScan when it completes, because the lead now exists). Only on a
    // NEW lead, so a retried submit cannot email the visitor twice.
    if (created) {
      const lite = await prisma.pulseLiteScan.findUnique({ where: { id }, select: { status: true } });
      if (lite?.status === "COMPLETED") after(() => notifyLeadOfScanResult(leadId).catch(() => {}));
    }

    return apiOk({ leadId, requested: true }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
