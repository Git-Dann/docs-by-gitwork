import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError, apiError } from "@/lib/api-response";
import { listAgentConfigs, saveAgentConfig } from "@/server/agent-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const agents = await listAgentConfigs();
    return apiOk(agents);
  } catch (e) {
    return fromError(e);
  }
}

const saveSchema = z.object({
  agentKey: z.string().min(1),
  enabled: z.boolean().optional(),
  systemPromptOverride: z.string().nullable().optional(),
  modelOverride: z.string().nullable().optional(),
  configJson: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = saveSchema.parse(await req.json());
    await saveAgentConfig(body);
    return apiOk({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return apiError(e.message, 400);
    return fromError(e);
  }
}
