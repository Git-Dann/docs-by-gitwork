import { resolveAiConfig, completeText } from "@/server/ai-provider";
import type { WorkspaceAiFields } from "@/server/ai-provider";

/** Minimal workspace AI config the agents need — a structural subset of both
 *  the sync `SyncContext` and the old `AgentContext`, so either can be passed. */
export type AiWorkspaceConfig = WorkspaceAiFields;

export interface AiContext {
  workspace: AiWorkspaceConfig;
}

export async function callAI(
  ctx: AiContext,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048,
): Promise<string> {
  const config = resolveAiConfig(ctx.workspace);
  return completeText({ config, system: systemPrompt, user: userPrompt, maxTokens });
}

export function extractJson<T>(text: string, fallback: T): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return fallback;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return fallback;
  }
}

