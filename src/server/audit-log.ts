/**
 * Audit log helper — append-only record of critical workspace events.
 *
 * Call `recordAuditEntry()` from server modules whenever a sensitive setting changes
 * (AI provider, API key rotation, member role change, integration connect/disconnect).
 *
 * Never throws — audit failures should not block the underlying action. Errors are logged
 * to the console for ops review.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditAction =
  // Settings
  | "settings.ai_provider.changed"
  | "settings.ai_key.rotated"
  | "settings.external_key.rotated"
  | "settings.branding.updated"
  | "settings.defaults.updated"
  // Team
  | "team.member.invited"
  | "team.member.role_changed"
  | "team.member.removed"
  | "team.password.reset"
  | "roles.matrix.updated"
  // Integrations
  | "integration.google.connected"
  | "integration.google.disconnected"
  | "integration.slack.connected"
  | "integration.slack.disconnected"
  | "integration.email.configured"
  | "integration.mcp.enabled"
  | "integration.mcp.disabled"
  | "integration.mcp.connected"
  | "integration.mcp.revoked"
  // Templates
  | "template.set_default"
  | "template.duplicated"
  // Foundry automation
  | "foundry.proposal_draft.prepared"
  | "foundry.onboarding_link.prepared"
  | "foundry.client.activated"
  | "foundry.delivery_plan.seeded"
  // Privacy
  | "workspace.data_exported"
  | "workspace.deleted";

export interface RecordAuditEntryInput {
  workspaceId: string;
  actorId: string | null;
  action: AuditAction;
  target?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEntry(input: RecordAuditEntryInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: input.action,
        target: input.target ?? null,
        before:
          input.before === undefined ? Prisma.JsonNull : (input.before as Prisma.InputJsonValue),
        after:
          input.after === undefined ? Prisma.JsonNull : (input.after as Prisma.InputJsonValue),
        metadata:
          input.metadata === undefined
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
      },
    });
  } catch (error) {
    console.error("[audit-log] failed to record entry", { input, error });
  }
}

export interface AuditLogEntry {
  id: string;
  action: string;
  target: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
}

export interface ListAuditLogParams {
  workspaceId: string;
  action?: string;
  limit?: number;
  cursor?: string;
}

export async function listAuditLog(params: ListAuditLogParams): Promise<{
  entries: AuditLogEntry[];
  nextCursor: string | null;
}> {
  const limit = Math.min(params.limit ?? 50, 200);
  const rows = await prisma.auditLog.findMany({
    where: {
      workspaceId: params.workspaceId,
      ...(params.action ? { action: params.action } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  return {
    entries: trimmed.map((row) => ({
      id: row.id,
      action: row.action,
      target: row.target,
      before: row.before,
      after: row.after,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor,
    })),
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
  };
}
