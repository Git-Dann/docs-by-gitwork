import { NextRequest } from "next/server";
import { assertAtLeastAdmin, getEffectiveUserOrNull, requireAuthedUser } from "@/server/auth/effective-user";
import { z } from "zod";
import { apiOk, fromError, apiError } from "@/lib/api-response";
import { listAgentConfigs, saveAgentConfig } from "@/server/agent-config";

import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertAtLeastAdmin(await requireAuthedUser(request));
    const agents = await listAgentConfigs(await workspaceIdForRequest(request));
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
    assertAtLeastAdmin(await getEffectiveUserOrNull(req));
    const body = saveSchema.parse(await req.json());
    await saveAgentConfig(await workspaceIdForRequest(req), body);
    return apiOk({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return apiError(e.message, 400);
    return fromError(e);
  }
}
