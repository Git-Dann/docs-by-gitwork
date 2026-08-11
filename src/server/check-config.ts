import { prisma } from "@/lib/prisma";
import { CHECKS_REGISTRY, type CheckDefinition } from "./checks-registry";
import { DEFAULT_WORKSPACE_SLUG } from "./proposals";
import type { PulseScanCheckInput } from "@/types/pulse";

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

async function getWorkspaceId(explicitWorkspaceId?: string): Promise<string> {
  if (explicitWorkspaceId) return explicitWorkspaceId;
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

export interface CheckPolicy {
  disabledKeys: Set<string>;
  overrides: Map<string, { labelOverride: string | null; severityOverride: string | null }>;
  customChecks?: CheckConfigRecord[];
}

/** Load the exact workspace policy used by the scan being executed. */
export async function loadCheckPolicy(workspaceId: string): Promise<CheckPolicy> {
  const rows = await prisma.pulseCheckConfig.findMany({ where: { workspaceId } });
  return {
    disabledKeys: new Set(rows.filter((row) => !row.enabled).map((row) => row.checkKey)),
    overrides: new Map(rows.map((row) => [
      row.checkKey,
      { labelOverride: row.labelOverride, severityOverride: row.severityOverride },
    ])),
    customChecks: rows
      .filter((row) => row.isCustom && row.enabled)
      .map((row) => ({
        checkKey: row.checkKey,
        category: String((row.customConfig as Record<string, unknown> | null)?.category ?? "Custom"),
        label: row.labelOverride ?? row.checkKey,
        enabled: row.enabled,
        labelOverride: row.labelOverride,
        severityOverride: row.severityOverride,
        isCustom: true,
        customConfig: (row.customConfig as Record<string, unknown> | null) ?? null,
        sortOrder: row.sortOrder,
      })),
  };
}

/**
 * Apply policy before persistence and scoring. Disabled controls remain visible
 * as NOT_TESTED so a policy pack can never silently improve a score.
 */
export function applyCheckPolicy(
  checks: PulseScanCheckInput[],
  policy?: CheckPolicy,
): PulseScanCheckInput[] {
  if (!policy) return checks;
  return checks.map((check) => {
    if (policy.disabledKeys.has(check.checkKey)) {
      return {
        ...check,
        status: "NOT_TESTED",
        detail: "Check disabled in workspace settings.",
        scoreEligible: false,
      };
    }

    const override = policy.overrides.get(check.checkKey);
    if (!override) return check;
    return {
      ...check,
      ...(override.labelOverride ? { label: override.labelOverride } : {}),
      ...(override.severityOverride && (check.status === "WARN" || check.status === "FAIL")
        ? { status: override.severityOverride as "WARN" | "FAIL" }
        : {}),
    };
  });
}

/** Enabled custom controls are honest manual evidence requests until a typed
 * executor exists for their declared customConfig. They no longer disappear. */
export function customPolicyChecks(policy?: CheckPolicy): PulseScanCheckInput[] {
  return (policy?.customChecks ?? []).map((custom) => ({
    category: custom.category as PulseScanCheckInput["category"],
    checkKey: custom.checkKey,
    label: custom.labelOverride ?? custom.label,
    status: "EVIDENCE_REQUIRED",
    detail: "This workspace-defined control requires a reviewer or trusted integration to supply evidence.",
    scoreEligible: false,
    confidence: "LOW",
    confidenceReason: "No typed automated executor is configured for this custom control.",
  }));
}
