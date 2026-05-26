import { prisma } from "@/lib/prisma";
import { CHECKS_REGISTRY, type CheckDefinition } from "./checks-registry";
import { DEFAULT_WORKSPACE_SLUG } from "./proposals";

export interface CheckConfigRecord {
  checkKey: string;
  category: string;
  label: string;
  enabled: boolean;
  labelOverride: string | null;
  severityOverride: string | null;
  isCustom: boolean;
  customConfig: Record<string, unknown> | null;
  sortOrder: number;
}

async function getWorkspaceId(): Promise<string> {
  const ws = await prisma.workspace.findFirstOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  return ws.id;
}

/** Returns all checks (built-in + custom) merged with workspace overrides. */
export async function listCheckConfigs(): Promise<CheckConfigRecord[]> {
  const workspaceId = await getWorkspaceId();

  const overrides = await prisma.pulseCheckConfig.findMany({
    where: { workspaceId },
    orderBy: { sortOrder: "asc" },
  });

  const overrideMap = new Map(overrides.map((o) => [o.checkKey, o]));

  // Built-in checks with overrides applied
  const builtIn: CheckConfigRecord[] = CHECKS_REGISTRY.map((def: CheckDefinition, i: number) => {
    const override = overrideMap.get(def.key);
    return {
      checkKey: def.key,
      category: def.category,
      label: def.label,
      enabled: override?.enabled ?? true,
      labelOverride: override?.labelOverride ?? null,
      severityOverride: override?.severityOverride ?? null,
      isCustom: false,
      customConfig: null,
      sortOrder: override?.sortOrder ?? i,
    };
  });

  // Custom checks (stored entirely in DB)
  const custom: CheckConfigRecord[] = overrides
    .filter((o) => o.isCustom)
    .map((o) => ({
      checkKey: o.checkKey,
      category: (o.customConfig as Record<string, unknown> | null)?.category as string ?? "Custom",
      label: o.labelOverride ?? o.checkKey,
      enabled: o.enabled,
      labelOverride: o.labelOverride,
      severityOverride: o.severityOverride,
      isCustom: true,
      customConfig: (o.customConfig as Record<string, unknown> | null) ?? null,
      sortOrder: o.sortOrder,
    }));

  return [...builtIn, ...custom];
}

export interface CheckConfigInput {
  checkKey: string;
  enabled?: boolean;
  labelOverride?: string | null;
  severityOverride?: string | null;
}

/** Upserts a per-workspace override for one check. */
export async function saveCheckConfig(input: CheckConfigInput): Promise<void> {
  const workspaceId = await getWorkspaceId();

  await prisma.pulseCheckConfig.upsert({
    where: { workspaceId_checkKey: { workspaceId, checkKey: input.checkKey } },
    create: {
      workspaceId,
      checkKey: input.checkKey,
      enabled: input.enabled ?? true,
      labelOverride: input.labelOverride ?? null,
      severityOverride: input.severityOverride ?? null,
    },
    update: {
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.labelOverride !== undefined && { labelOverride: input.labelOverride }),
      ...(input.severityOverride !== undefined && { severityOverride: input.severityOverride }),
    },
  });
}

/** Removes the workspace override for a check (restores defaults). */
export async function resetCheckConfig(checkKey: string): Promise<void> {
  const workspaceId = await getWorkspaceId();
  await prisma.pulseCheckConfig.deleteMany({
    where: { workspaceId, checkKey },
  });
}

/** Returns a Set of check keys that are disabled for this workspace. */
export async function getDisabledCheckKeys(): Promise<Set<string>> {
  const workspaceId = await getWorkspaceId();
  const disabled = await prisma.pulseCheckConfig.findMany({
    where: { workspaceId, enabled: false },
    select: { checkKey: true },
  });
  return new Set(disabled.map((d) => d.checkKey));
}

/** Returns a map of checkKey → overrides (label, severity) for this workspace. */
export async function getCheckOverrides(): Promise<Map<string, { labelOverride: string | null; severityOverride: string | null }>> {
  const workspaceId = await getWorkspaceId();
  const overrides = await prisma.pulseCheckConfig.findMany({
    where: { workspaceId },
    select: { checkKey: true, labelOverride: true, severityOverride: true },
  });
  return new Map(
    overrides.map((o) => [
      o.checkKey,
      { labelOverride: o.labelOverride, severityOverride: o.severityOverride },
    ]),
  );
}
