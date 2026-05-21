import type { AccountConnection, ChannelToken } from "@prisma/client";

// ─── Raw data shape returned by each source fetcher ──────────────────────────

export interface RawIngestItem {
  externalId: string;
  customerLabel: string;
  rawSubject: string;
  rawBody: string;
  receivedAt: Date;
  threadItems?: Array<{
    id: string;
    authorLabel: string;
    body: string;
    createdAt: Date;
    isOutbound?: boolean;
  }>;
  sourceMetadata?: Record<string, unknown>;
}

// ─── What the ingest agent produces after AI filtering ───────────────────────

export type IssueType = "bug" | "billing" | "feature_request" | "question" | "complaint" | "other";
export type AgentPriority = "urgent" | "high" | "normal" | "low";
export type AgentSentiment = "positive" | "neutral" | "negative";

export interface IngestedConversation {
  externalId: string;
  customerLabel: string;
  subject: string;
  preview: string;
  issueType: IssueType;
  priority: AgentPriority;
  sentiment: AgentSentiment;
  createTicket: boolean;
  ticketTitle: string;
  receivedAt: Date;
  threadItems?: RawIngestItem["threadItems"];
}

// ─── Result returned by the orchestrator for each connection run ──────────────

export interface AgentRunResult {
  fetched: number;
  ingested: number;
  filtered: number;
  ticketsCreated: number;
  draftsGenerated: number;
  errors: string[];
}

// ─── Context passed to every agent ───────────────────────────────────────────

export interface AgentContext {
  connection: AccountConnection & { channelTokens: ChannelToken[] };
  client: { id: string; name: string; slug: string };
  workspace: {
    googleServiceAccountJson?: string | null;
    googleSubjectEmail?: string | null;
    aiProvider: string;
    anthropicApiKey?: string | null;
    anthropicModel?: string | null;
    openaiApiKey?: string | null;
    openaiModel?: string | null;
    geminiApiKey?: string | null;
    geminiModel?: string | null;
    localLlmUrl?: string | null;
    localLlmModel?: string | null;
  };
}
