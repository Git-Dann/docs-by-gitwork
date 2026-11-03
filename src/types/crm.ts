import type { LeadStage } from "@/types/client";

export type LeadActionState = "suggested" | "open" | "done" | "dismissed";

export interface LeadActionDTO {
  id: string;
  title: string;
  dueAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  state: LeadActionState;
  source: "manual" | "ai";
  /** One-line "why" for an AI-proposed action. */
  reason: string | null;
  /** The message an AI action was read from, for context. */
  evidence: { note: string | null; occurredAt: string; source: string | null } | null;
  doneAt: string | null;
  createdAt: string;
}

export interface CrmStageSuggestionDTO {
  id: string;
  stage: LeadStage;
  reason: string | null;
  occurredAt: string;
  direction: string | null;
}

export interface CrmMailbox {
  userId: string;
  name: string;
  /** False when they opted in but have no Google token, so nothing can actually be read. */
  connected: boolean;
}

export interface LeadCrmStatus {
  enabled: boolean;
  stage: LeadStage | null;
  pinned: boolean;
  stageChangedAt: string | null;
  owner: { id: string; name: string } | null;
  /** What was typed for this lead, and what the sync actually uses (typed + derived). */
  emailDomains: string[];
  effectiveDomains: string[];
  mailboxes: CrmMailbox[];
  /** The caller's own opt-in, so the panel can offer "Use my Gmail". */
  me: { userId: string; mailboxEnabled: boolean; googleConnected: boolean } | null;
  slackChannel: { id: string; name: string | null } | null;
  lastSyncedAt: string | null;
  lastSyncError: string[];
  syncing: boolean;
  suggestions: CrmStageSuggestionDTO[];
  actions: LeadActionDTO[];
  /** Earliest open action — the lead's next step. */
  nextStep: LeadActionDTO | null;
  /** People an action can be assigned to (active members only). */
  people: Array<{ id: string; name: string }>;
}

export interface ConvertPreview {
  fields: Array<{ field: "primaryContactName" | "primaryContactEmail" | "website"; label: string; proposed: string; source: string }>;
  /** The proposal a delivery plan can be seeded from — accepted or signed first. */
  proposal: { id: string; title: string; accepted: boolean; linked: boolean } | null;
  openActions: number;
}

export interface ConvertResult {
  clientSlug: string;
  applied: string[];
  /** The proposal now linked to the client, ready for Plan review. Null when there isn't one. */
  proposalId: string | null;
}

/** An open action on the caller's Desk. */
export interface MyLeadAction extends LeadActionDTO {
  lead: { slug: string; name: string; stage: LeadStage | null };
}

export type CrmSyncStatus = "synced" | "busy" | "not_found" | "not_enabled" | "not_a_lead";

export interface CrmSyncResult {
  status: CrmSyncStatus;
  added: number;
  moved: { from: LeadStage | null; to: LeadStage; reason: string } | null;
  suggested: number;
  actionsProposed: number;
  /** Each problem in words. Empty = every configured source was read. */
  errors: string[];
  /** Why the AI read didn't run, when it didn't (no AI key, caller lacks the AI gate…). */
  suggestionsSkipped: string | null;
  counts: { mailboxes: number; emails: number; slackMessages: number; meetings: number; documentEvents: number };
}
