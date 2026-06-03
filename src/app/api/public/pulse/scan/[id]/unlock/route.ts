import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { capturePulseLead } from "@/server/pulse-lite/leads";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/public/pulse/scan/[id]/unlock  (PUBLIC — no API key)
 * Body: { email }. Records the lead, unlocks the detailed findings for that scan,
 * and notifies the team. Idempotent.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return apiError("Enter a valid email address.", 400);
    }
    await capturePulseLead({ liteScanId: id, email });
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
