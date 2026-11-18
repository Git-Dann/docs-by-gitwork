/**
 * Where each of Big Wedge's twelve workflow stages lands on the Wedge board.
 *
 * Their columns are Foundry board columns (CLAUDE.md §89), each tied to one of our statuses so
 * standups, Foreman and the timeline keep working; the column marked default is where a task of
 * that status with no column sits (§124). The importer only REFERENCES columns by name; it never
 * creates or edits them, and refuses to run when one it needs is missing.
 *
 * ⚠️ "In Review" is not a column: a board column may not repeat a status's own name, and our
 * In Review status already carries it. A task in that stage simply goes in the In Review lane.
 */

import type { TaskStatus } from "@/types/tasks";
import { TASK_STATUS_LABELS } from "@/types/tasks";
import { columnNameKey } from "@/lib/tasks/board-columns";

export interface StagePlacement {
  status: TaskStatus;
  /** The board column, or null when the stage IS a status lane ("In Review"). */
  column: string | null;
}

export const FORGE_STAGES: Record<string, StagePlacement> = {
  "future-idea": { status: "BACKLOG", column: "Future Idea" },
  triage: { status: "BACKLOG", column: "Triage" },
  "bug-tracking": { status: "TODO", column: "Bug Tracking" },
  "documentation-period": { status: "TODO", column: "Documentation Period" },
  "technical-audit": { status: "TODO", column: "Technical Audit" },
  "design-period": { status: "TODO", column: "Design Period" },
  blocked: { status: "TODO", column: "Blocked" },
  "up-next": { status: "TODO", column: "Up Next (Assign Hours)" },
  "in-development": { status: "DOING", column: "In Development" },
  "in-review": { status: "IN_REVIEW", column: null },
  deployed: { status: "IN_REVIEW", column: "Deployed (Test Flight)" },
  "live-features": { status: "DONE", column: "Live Features" },
};

/** An item whose stage we don't recognise is not dropped: it goes to Future Idea and is flagged. */
export const UNKNOWN_STAGE: StagePlacement = { status: "BACKLOG", column: "Future Idea" };

/**
 * ⚠️ Own properties only. The stage comes from someone else's feed, and a plain object lookup
 * answers "constructor" or "__proto__" with something that isn't a placement.
 */
export function placementFor(stage: string): { placement: StagePlacement; known: boolean } {
  return Object.hasOwn(FORGE_STAGES, stage)
    ? { placement: FORGE_STAGES[stage], known: true }
    : { placement: UNKNOWN_STAGE, known: false };
}

/** Column names the board must have before an import can run. */
export function requiredColumns(): string[] {
  const statusNames = new Set(Object.values(TASK_STATUS_LABELS).map(columnNameKey));
  const names = new Set<string>();
  for (const p of [...Object.values(FORGE_STAGES), UNKNOWN_STAGE]) {
    if (p.column && !statusNames.has(columnNameKey(p.column))) names.add(p.column);
  }
  return [...names];
}
