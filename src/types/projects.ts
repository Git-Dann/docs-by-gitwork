import type { ProjectFigures, ProjectStatus, WorkProgress } from "@/lib/project-budget";

/** A project as the Portal client page, the task form and Money read it (CLAUDE.md §150). */
export interface ProjectDTO {
  id: string;
  clientId: string;
  name: string;
  status: ProjectStatus;
  /** ISO. */
  startDate: string;
  endDate: string | null;
  /** The accepted proposal or SOW it came from. */
  document: { id: string; title: string } | null;
  progress: WorkProgress;
  /** Share (0–1) of the dates gone by; null with no end date. */
  timeShare: number | null;
  releases: Array<{ id: string; label: string }>;
  categories: Array<{ id: string; name: string }>;
  /** Other live projects of this client whose dates overlap (they share the client's team). */
  sharedWith: string[];
  /**
   * Budget, spend and the verdict. Only for Super Admins and `clients.viewFinancials` holders:
   * the server leaves it null for everyone else, it is never just hidden in the browser.
   */
  money: ProjectMoney | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMoney extends ProjectFigures {
  /** Why the linked document gives no budget (archived, not accepted, no costs). Null otherwise. */
  budgetProblem: string | null;
  /** The budget typed by hand, as stored, so the editor can show it. */
  manualBudget: { amount: number; currency: string } | null;
}

export interface ProjectTaskRow {
  id: string;
  title: string;
  status: string;
  done: boolean;
  estimateHours: number | null;
  /** How it belongs: its own link, its release, or its category. */
  via: "task" | "release" | "category";
}

export interface ProjectDetailDTO extends ProjectDTO {
  /** Open tasks first, then done, newest first within each. At most 60. */
  tasks: ProjectTaskRow[];
}

/** A row of Money's per-project table. */
export interface ProjectBudgetRow {
  id: string;
  name: string;
  status: ProjectStatus;
  clientName: string;
  clientSlug: string;
  startDate: string;
  endDate: string | null;
  progress: WorkProgress;
  timeShare: number | null;
  money: ProjectMoney;
}

/** Accepted documents of a client that a project can be linked to, with the budget each gives. */
export interface LinkableDocument {
  id: string;
  title: string;
  /** ISO, when it was accepted or signed. */
  wonAt: string;
  /** What it is worth (Money's rules). Null when the viewer may not see money figures. */
  total: number | null;
  currency: string | null;
}
