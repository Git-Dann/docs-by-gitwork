import type { ChecklistItem, CommitmentPriority, CommitmentSource, CommitmentState } from "@/lib/commitments";

export interface CommitmentDTO {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  state: CommitmentState;
  source: CommitmentSource;
  counterpart: string | null;
  /** The words a suggestion was read from (never a whole message). */
  quote: string | null;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
  evidenceAt: string | null;
  reason: string | null;
  snoozedUntil: string | null;
  doneAt: string | null;
  /** To-do fields (Foundry for Mac). */
  listId: string | null;
  tags: string[];
  /** 0 none · 1 low · 2 medium · 3 high */
  priority: CommitmentPriority;
  /** The day it's planned for ("when"). Never set while `someday`. */
  startAt: string | null;
  evening: boolean;
  someday: boolean;
  remindAt: string | null;
  recurrence: string | null;
  checklist: ChecklistItem[];
  orderKey: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentListDTO {
  id: string;
  name: string;
  color: string | null;
  symbol: string | null;
  area: string | null;
  orderKey: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentSourceStatus {
  ok: boolean;
  message: string;
  at: string;
}

export interface CommitmentSettingsDTO {
  gmailEnabled: boolean;
  slackEnabled: boolean;
  meetingsEnabled: boolean;
  calendarEnabled: boolean;
  lastSyncedAt: string | null;
  syncing: boolean;
  /** Keyed by source: gmail · slack · meeting · calendar. */
  sourceStatus: Record<string, CommitmentSourceStatus>;
  slackConnected: boolean;
}

export interface CommitmentSyncResult {
  /** "busy" = another read for this person is already running. */
  status: "ok" | "partial" | "busy";
  added: number;
  sources: Record<string, CommitmentSourceStatus>;
}

export interface CommitmentsResponse {
  commitments: CommitmentDTO[];
  settings: CommitmentSettingsDTO;
  /** The person's lists that aren't archived, in order. */
  lists: CommitmentListDTO[];
}
