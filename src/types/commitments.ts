import type { CommitmentSource, CommitmentState } from "@/lib/commitments";

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
}
