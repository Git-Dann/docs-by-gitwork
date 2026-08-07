/**
 * Workspace-level proposal defaults — preparedBy, team, contact, and reusable snippets.
 *
 * These were previously stored in localStorage (per-browser), so a workspace default would
 * be different on each team member's machine. They now live in the `Workspace.proposalDefaults`
 * JSON column. Confidentiality copy continues to live in `Workspace.branding` since it's
 * coupled to cover/document branding.
 */

import { Prisma } from "@prisma/client";
import { GITWORK } from "@/lib/gitwork";

export interface ObjectiveSnippet {
  title: string;
  description: string;
}

export interface WorkspaceProposalDefaults {
  preparedBy: string;
  team: string;
  contactDetails: string;
  objectiveSnippets: ObjectiveSnippet[];
}

export const EMPTY_PROPOSAL_DEFAULTS: WorkspaceProposalDefaults = {
  preparedBy: "Gitwork Delivery Team",
  team: "Product & Delivery",
  contactDetails: GITWORK.email,
  objectiveSnippets: [
    {
      title: "Reduce proposal cycle time",
      description: "Decrease proposal drafting and review timeline by at least 40%.",
    },
    {
      title: "Increase consistency",
      description: "Standardize structure and language across all proposal outputs.",
    },
  ],
};

export function parseWorkspaceProposalDefaults(
  value: Prisma.JsonValue | null | undefined,
): WorkspaceProposalDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_PROPOSAL_DEFAULTS };
  }
  const v = value as Record<string, unknown>;

  const rawSnippets = Array.isArray(v.objectiveSnippets) ? v.objectiveSnippets : [];
  const objectiveSnippets: ObjectiveSnippet[] = rawSnippets
    .map((entry): ObjectiveSnippet | null => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const title = typeof e.title === "string" ? e.title : "";
      const description = typeof e.description === "string" ? e.description : "";
      if (!title && !description) return null;
      return { title, description };
    })
    .filter((entry): entry is ObjectiveSnippet => entry !== null);

  return {
    preparedBy:
      typeof v.preparedBy === "string" ? v.preparedBy : EMPTY_PROPOSAL_DEFAULTS.preparedBy,
    team: typeof v.team === "string" ? v.team : EMPTY_PROPOSAL_DEFAULTS.team,
    contactDetails:
      typeof v.contactDetails === "string"
        ? v.contactDetails
        : EMPTY_PROPOSAL_DEFAULTS.contactDetails,
    objectiveSnippets:
      objectiveSnippets.length > 0
        ? objectiveSnippets
        : [...EMPTY_PROPOSAL_DEFAULTS.objectiveSnippets],
  };
}
