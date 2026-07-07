import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { DevSignalPipelineConfigDTO } from "@/types/devsignal";

/** CRUD for DevSignalPipelineConfig rows (the versioned, per-client pipeline configs). */

function serializeConfig(row: {
  id: string;
  clientId: string | null;
  name: string;
  version: string;
  isDefault: boolean;
  enabledStages: Prisma.JsonValue;
  stageOrder: Prisma.JsonValue;
  stageWeights: Prisma.JsonValue;
  blockingRules: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): DevSignalPipelineConfigDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    version: row.version,
    isDefault: row.isDefault,
    enabledStages: (row.enabledStages ?? []) as string[],
    stageOrder: (row.stageOrder ?? []) as string[],
    stageWeights: (row.stageWeights ?? {}) as Record<string, number>,
    blockingRules: (row.blockingRules ?? {}) as Record<string, boolean>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPipelineConfigs(workspaceId: string): Promise<DevSignalPipelineConfigDTO[]> {
  const rows = await prisma.devSignalPipelineConfig.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(serializeConfig);
}

export interface PipelineConfigInput {
  name: string;
  clientId?: string | null;
  version: string;
  isDefault?: boolean;
  enabledStages: string[];
  stageOrder: string[];
  stageWeights: Record<string, number>;
  blockingRules?: Record<string, boolean>;
  thresholds?: Record<string, unknown>;
  createdBy?: string | null;
}

export async function createPipelineConfig(
  workspaceId: string,
  input: PipelineConfigInput,
): Promise<DevSignalPipelineConfigDTO> {
  const clientId = input.clientId ?? null;
  // A new default demotes the previous default for the same scope.
  if (input.isDefault) {
    await prisma.devSignalPipelineConfig.updateMany({
      where: { workspaceId, clientId, isDefault: true },
      data: { isDefault: false },
    });
  }
  const row = await prisma.devSignalPipelineConfig.create({
    data: {
      workspaceId,
      clientId,
      name: input.name,
      version: input.version,
      isDefault: input.isDefault ?? false,
      enabledStages: input.enabledStages,
      stageOrder: input.stageOrder,
      stageWeights: input.stageWeights as Prisma.InputJsonValue,
      blockingRules: (input.blockingRules ?? undefined) as Prisma.InputJsonValue | undefined,
      thresholds: (input.thresholds ?? undefined) as Prisma.InputJsonValue | undefined,
      createdBy: input.createdBy ?? null,
      publishedAt: new Date(),
    },
  });
  return serializeConfig(row);
}
