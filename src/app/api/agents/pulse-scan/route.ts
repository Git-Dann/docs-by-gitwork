import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { runAgentScan } from "@/server/pulse-agent";

// Authenticated agent endpoint — NOT in PUBLIC_API_PATHS, so middleware gates it
// (workspace API key or OAuth bearer). Lets AI coding tools request a Pulse scan and
// get a compact verdict. SSRF-guarded + AI-free inside runAgentScan. Synchronous
// lite scan (~15–30s); bounded by maxDuration.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url(),
  targetMarkets: z.array(z.string().trim().min(1).max(16)).max(30).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json());
    const verdict = await runAgentScan({ url: body.url, targetMarkets: body.targetMarkets });
    return apiOk({ verdict });
  } catch (error) {
    return fromError(error);
  }
}
