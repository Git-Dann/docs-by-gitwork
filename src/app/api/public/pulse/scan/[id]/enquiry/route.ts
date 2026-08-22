import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { capturePulseLead } from "@/server/pulse-lite/leads";
import { clientIpFrom } from "@/server/pulse-lite/rate-limit";
import { PulseEmbedDisabledError } from "@/server/pulse-lite/kill-switch";
import { assertValidTurnstileToken } from "@/server/pulse-lite/turnstile";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";
import { isPulseScanSource } from "@/server/pulse-embed-config";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/public/pulse/scan/[id]/enquiry  (PUBLIC — no API key)
 * Body: { email, source?, honeypot?, turnstileToken? }
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
 * Deliberately NOT a paywall unlock: it records a warm lead and hands the request to
 * the team. Nothing here runs an AI pipeline on demand — an anonymous caller must
 * never be able to spend tokens. `importLeadToFoundry` (authenticated, admin) is
 * still the only path that starts a full scan.
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
      email?: string;
      source?: string;
      honeypot?: string;
      turnstileToken?: string;
    };

    if (body.honeypot) return apiError("Couldn't send that enquiry.", 400);

    const ip = clientIpFrom(request.headers);
    await assertValidTurnstileToken(body.turnstileToken, ip, config.turnstileSecretKey);

    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return apiError("Enter a valid email address.", 400);
    }

    const source = isPulseScanSource(body.source) ? body.source : undefined;
    // capturePulseLead is idempotent per scan and throws EmailAlreadyUsedError (409)
    // for an address that has already been captured — `fromError` maps that status.
    const { leadId } = await capturePulseLead({ liteScanId: id, email, source });

    return apiOk({ leadId, requested: true }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
