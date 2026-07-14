import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { capturePulseLead } from "@/server/pulse-lite/leads";
import { PulseEmbedDisabledError } from "@/server/pulse-lite/kill-switch";
import { assertValidTurnstileToken } from "@/server/pulse-lite/turnstile";
import { clientIpFrom } from "@/server/pulse-lite/rate-limit";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KNOWN_SOURCES = new Set(["gitwork.co.uk", "foundry-demo"]);

/**
 * POST /api/public/pulse/scan/[id]/unlock  (PUBLIC — no API key)
 * Body: { email }. Records the lead, unlocks the detailed findings for that scan,
 * and notifies the team + the visitor. Idempotent per scan; rejects with 409 if the
 * email has already claimed its one lifetime free unlock on a different scan.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Cheapest checks first: kill-switch → honeypot → Turnstile → email validation.
    const config = await getPulseEmbedWorkspaceConfig();
    if (!config.enabled) throw new PulseEmbedDisabledError();

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { email?: string; source?: string; honeypot?: string; turnstileToken?: string };

    // Honeypot — a hidden field real visitors never fill. Reject silently with the
    // same generic shape as a normal validation failure, no "bot detected" tell.
    if (body.honeypot) return apiError("Enter a valid email address.", 400);

    await assertValidTurnstileToken(body.turnstileToken, clientIpFrom(request.headers), config.turnstileSecretKey);

    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return apiError("Enter a valid email address.", 400);
    }
    const source = body.source && KNOWN_SOURCES.has(body.source) ? body.source : undefined;
    await capturePulseLead({ liteScanId: id, email, source });
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
