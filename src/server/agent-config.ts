import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AGENTS_REGISTRY, type AgentDefinition } from "./agents-registry";
import { DEFAULT_WORKSPACE_SLUG } from "./proposals";

export interface AgentConfigRecord {
  agentKey: string;
  product: string;
  name: string;
  description: string;
  hasPrompt: boolean;
  enabled: boolean;
  systemPromptOverride: string | null;
  modelOverride: string | null;
  configJson: Record<string, unknown> | null;
}

async function getWorkspaceId(): Promise<string> {
  const ws = await prisma.workspace.findFirstOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  return ws.id;
}

/** Returns all agents merged with any workspace overrides. */
export async function listAgentConfigs(): Promise<AgentConfigRecord[]> {
  const workspaceId = await getWorkspaceId();

  const overrides = await prisma.agentConfig.findMany({
    where: { workspaceId },
  });

  const overrideMap = new Map(overrides.map((o) => [o.agentKey, o]));

  return AGENTS_REGISTRY.map((def: AgentDefinition) => {
    const override = overrideMap.get(def.key);
    return {
      agentKey: def.key,
      product: def.product,
      name: def.name,
      description: def.description,
      hasPrompt: def.hasPrompt,
      enabled: override?.enabled ?? true,
      systemPromptOverride: override?.systemPromptOverride ?? null,
      modelOverride: override?.modelOverride ?? null,
      configJson: (override?.configJson as Record<string, unknown> | null) ?? null,
    };
  });
}

export interface AgentConfigInput {
  agentKey: string;
  enabled?: boolean;
  systemPromptOverride?: string | null;
  modelOverride?: string | null;
  configJson?: Record<string, unknown> | null;
}

/** Upserts a per-workspace override for one agent. */
export async function saveAgentConfig(input: AgentConfigInput): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const def = AGENTS_REGISTRY.find((a) => a.key === input.agentKey);
  if (!def) throw new Error(`Unknown agent key: ${input.agentKey}`);

  await prisma.agentConfig.upsert({
    where: { workspaceId_agentKey: { workspaceId, agentKey: input.agentKey } },
    create: {
      workspaceId,
      agentKey: input.agentKey,
      product: def.product,
      enabled: input.enabled ?? true,
      systemPromptOverride: input.systemPromptOverride ?? null,
      modelOverride: input.modelOverride ?? null,
      configJson: (input.configJson ?? Prisma.DbNull) as Prisma.InputJsonValue,
    },
    update: {
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.systemPromptOverride !== undefined && { systemPromptOverride: input.systemPromptOverride }),
      ...(input.modelOverride !== undefined && { modelOverride: input.modelOverride }),
      ...(input.configJson !== undefined && { configJson: (input.configJson ?? Prisma.DbNull) as Prisma.InputJsonValue }),
    },
  });
}

/** Removes the workspace override for an agent (restores defaults). */
export async function resetAgentConfig(agentKey: string): Promise<void> {
  const workspaceId = await getWorkspaceId();
  await prisma.agentConfig.deleteMany({
    where: { workspaceId, agentKey },
  });
}

/** Returns the system prompt to use for a given agent key — override first, then default. */
export async function resolveAgentPrompt(
  agentKey: string,
  defaultPrompt: string,
): Promise<string> {
  const workspaceId = await getWorkspaceId();
  const override = await prisma.agentConfig.findUnique({
    where: { workspaceId_agentKey: { workspaceId, agentKey } },
    select: { systemPromptOverride: true, enabled: true },
  });
  if (!override?.enabled) return defaultPrompt; // disabled falls back silently
  return override?.systemPromptOverride ?? defaultPrompt;
}
