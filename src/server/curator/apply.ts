/**
 * Curator — apply / dismiss LLM proposals (Super-Admin approved).
 *
 * Proposals live as JSON on the CuratorRun. Applying routes through the SAME mutators the rest of
 * the app uses (updateStarter, saveCheckConfig), then flips the proposal's status in place.
 * STARTER_CONSOLIDATE is advisory-only — there's no safe one-click merge (starters can carry
 * mirrored files), so it can only be dismissed.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditEntry } from "@/server/audit-log";
import { updateStarter } from "@/server/starters";
import { saveCheckConfig } from "@/server/check-config";
import type { CuratorProposal } from "./types";

export interface ApplyOutcome {
  ok: boolean;
  proposal?: CuratorProposal;
  reason?: string;
}

async function loadProposals(runId: string): Promise<{ workspaceId: string; proposals: CuratorProposal[] } | null> {
  const run = await prisma.curatorRun.findUnique({
    where: { id: runId },
    select: { workspaceId: true, proposals: true },
  });
  if (!run) return null;
  const proposals = Array.isArray(run.proposals) ? (run.proposals as unknown as CuratorProposal[]) : [];
  return { workspaceId: run.workspaceId, proposals };
}

async function persist(runId: string, proposals: CuratorProposal[]): Promise<void> {
  await prisma.curatorRun.update({
    where: { id: runId },
    data: { proposals: proposals as unknown as Prisma.InputJsonValue },
  });
}

export async function applyProposal(runId: string, proposalId: string): Promise<ApplyOutcome> {
  const loaded = await loadProposals(runId);
  if (!loaded) return { ok: false, reason: "Run not found" };

  const proposal = loaded.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { ok: false, reason: "Proposal not found" };
  if (proposal.status !== "open") return { ok: false, reason: `Proposal already ${proposal.status}` };

  switch (proposal.kind) {
    case "STARTER_ARCHIVE": {
      const updated = await updateStarter(proposal.target, { isArchived: true, curatorState: "ARCHIVED" });
      if (!updated) return { ok: false, reason: "Starter not found" };
      break;
    }
    case "STARTER_CONSOLIDATE":
      return { ok: false, reason: "Consolidation is advisory only — merge manually, then archive the duplicates." };
    case "CHECK_DISABLE":
      await saveCheckConfig({ checkKey: proposal.target, enabled: false });
      break;
    case "CHECK_SEVERITY": {
      const severity = proposal.payload?.severity;
      if (severity !== "WARN" && severity !== "FAIL") return { ok: false, reason: "Invalid severity" };
      await saveCheckConfig({ checkKey: proposal.target, severityOverride: severity });
      break;
    }
    case "CHECK_RELABEL": {
      const label = proposal.payload?.label;
      if (typeof label !== "string" || !label.trim()) return { ok: false, reason: "Invalid label" };
      await saveCheckConfig({ checkKey: proposal.target, labelOverride: label.trim() });
      break;
    }
    default:
      return { ok: false, reason: "Unknown proposal kind" };
  }

  proposal.status = "applied";
  await persist(runId, loaded.proposals);
  await recordAuditEntry({
    workspaceId: loaded.workspaceId,
    actorId: null,
    action: "curator.proposal.applied",
    target: runId,
    metadata: { proposalId, kind: proposal.kind, targetRef: proposal.target },
  });
  return { ok: true, proposal };
}

export async function dismissProposal(runId: string, proposalId: string): Promise<ApplyOutcome> {
  const loaded = await loadProposals(runId);
  if (!loaded) return { ok: false, reason: "Run not found" };

  const proposal = loaded.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { ok: false, reason: "Proposal not found" };
  if (proposal.status !== "open") return { ok: false, reason: `Proposal already ${proposal.status}` };

  proposal.status = "dismissed";
  await persist(runId, loaded.proposals);
  await recordAuditEntry({
    workspaceId: loaded.workspaceId,
    actorId: null,
    action: "curator.proposal.dismissed",
    target: runId,
    metadata: { proposalId, kind: proposal.kind },
  });
  return { ok: true, proposal };
}
