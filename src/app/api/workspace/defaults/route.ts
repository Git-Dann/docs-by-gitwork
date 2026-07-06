/**
 * GET  /api/workspace/defaults → workspace proposal defaults (with built-in fallbacks)
 * PATCH /api/workspace/defaults → merge-update the defaults
 *
 * Single workspace today (per `ensureBaseRecords()`). When multi-workspace lands this needs
 * to become per-tenant — read the active workspace from the session.
 */

import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { recordAuditEntry } from "@/server/audit-log";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  EMPTY_PROPOSAL_DEFAULTS,
  parseWorkspaceProposalDefaults,
  type WorkspaceProposalDefaults,
} from "@/server/workspace-defaults";

const snippetSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(2000),
});

const patchSchema = z.object({
  preparedBy: z.string().max(200).optional(),
  team: z.string().max(200).optional(),
  contactDetails: z.string().max(400).optional(),
  objectiveSnippets: z.array(snippetSchema).max(50).optional(),
});

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();
    const defaults = parseWorkspaceProposalDefaults(workspace.proposalDefaults);
    return apiOk({ defaults });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const { workspace } = await ensureBaseRecords();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const current = parseWorkspaceProposalDefaults(workspace.proposalDefaults);
    const next: WorkspaceProposalDefaults = {
      ...EMPTY_PROPOSAL_DEFAULTS,
      ...current,
      ...parsed.data,
    };

    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { proposalDefaults: next as unknown as Prisma.InputJsonValue },
      select: { proposalDefaults: true },
    });

    const session = await auth();
    // Only record an audit entry when something actually changed at the field level — avoid
    // a noisy log when the PATCH is a no-op (e.g. UI re-saves on focus blur).
    const changedFields = Object.keys(parsed.data).filter(
      (key) =>
        JSON.stringify(parsed.data[key as keyof typeof parsed.data]) !==
        JSON.stringify(current[key as keyof typeof current]),
    );
    if (changedFields.length > 0) {
      await recordAuditEntry({
        workspaceId: workspace.id,
        actorId: session?.user?.id ?? null,
        action: "settings.defaults.updated",
        target: `workspace.proposalDefaults.${changedFields.join("+")}`,
        metadata: { changedFields },
      });
    }

    return apiOk({ defaults: parseWorkspaceProposalDefaults(updated.proposalDefaults) });
  } catch (error) {
    return fromError(error);
  }
}
