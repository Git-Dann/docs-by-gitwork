import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * DevSignal audit trail. Every material action writes a DevSignalAuditEvent so
 * a score, decision, or promotion can always be reconstructed (hard rules
 * 9–12). Mirrors the existing ActivityLog precedent.
 */

export const DEV_SIGNAL_AUDIT_EVENTS = {
  ASSESSMENT_CREATED: "assessment_created",
  STAGE_STARTED: "stage_started",
  STAGE_COMPLETED: "stage_completed",
  STAGE_FAILED: "stage_failed",
  CONFIG_SNAPSHOTTED: "config_snapshotted",
  SCORE_COMPUTED: "score_computed",
  DECISION_RECORDED: "decision_recorded",
  PROMOTION_ATTEMPTED: "promotion_attempted",
  PROMOTION_COMPLETED: "promotion_completed",
  OUTCOME_LINKED: "outcome_linked",
} as const;

export type DevSignalAuditEventType =
  (typeof DEV_SIGNAL_AUDIT_EVENTS)[keyof typeof DEV_SIGNAL_AUDIT_EVENTS];

export async function recordAuditEvent(args: {
  workspaceId: string;
  eventType: DevSignalAuditEventType;
  assessmentId?: string | null;
  candidateId?: string | null;
  actorId?: string | null;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.devSignalAuditEvent.create({
    data: {
      workspaceId: args.workspaceId,
      eventType: args.eventType,
      assessmentId: args.assessmentId ?? null,
      candidateId: args.candidateId ?? null,
      actorId: args.actorId ?? null,
      eventPayload: args.payload ?? undefined,
    },
  });
}
