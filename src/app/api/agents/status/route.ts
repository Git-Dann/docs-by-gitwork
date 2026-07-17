import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { AGENT_STATES, listAgentStatus, setAgentStatus, summaryAgentState } from "@/server/agent-status";

// Authenticated agent-status beacon — NOT in PUBLIC_API_PATHS, so middleware gates it
// (workspace API key or OAuth bearer). Claude Code hooks POST the current agent state;
// the Foundry Micro Stream Deck bridge GETs the summary to animate Claw'd. Ephemeral,
// in-memory (see src/server/agent-status.ts) — no persistence.
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
  state: z.enum(AGENT_STATES),
  label: z.string().trim().max(80).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json());
    setAgentStatus(body.sessionId, body.state, body.label);
    return apiOk({ ok: true, state: body.state });
  } catch (error) {
    return fromError(error);
  }
}

export async function GET() {
  try {
    return apiOk({ state: summaryAgentState(), agents: listAgentStatus() });
  } catch (error) {
    return fromError(error);
  }
}
