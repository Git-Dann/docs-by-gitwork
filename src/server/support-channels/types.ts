// Channel-adapter contract + shared sync types. This module owns the canonical
// SyncContext / SyncResult / FilterReasons (re-exported from @/server/support-sync for
// backward compatibility with the API routes).

/** Why items were skipped this run — surfaced on the connector card so "N filtered" is explainable. */
export interface FilterReasons {
  bots?: number;
  empty?: number;
  duplicate?: number;
  excluded?: number;
}

export interface SyncResult {
  fetched?: number;
  ingested: number;
  filtered: number;
  /** Per-reason breakdown of `filtered`. */
  filterReasons?: FilterReasons;
  /** Actionable diagnostics (e.g. missing Discord Message Content Intent). */
  hints?: string[];
  errors: string[];
  /** IDs of conversations newly created this run — fed to the enrichment pass. */
  newConversationIds?: string[];
}

export interface SyncContext {
  connection: {
    id: string;
    source: string;
    scraperConfig: unknown;
    syncCursor: string | null;
    lastSyncedAt: Date | null;
    channelTokens: unknown[];
  };
  client: { id: string; name: string; slug: string };
  workspace: {
    id: string;
    googleServiceAccountJson: string | null;
    googleSubjectEmail: string | null;
    googleOAuthRefreshToken: string | null;
    aiProvider: string;
    anthropicApiKey: string | null;
    anthropicModel: string | null;
    openaiApiKey: string | null;
    openaiModel: string | null;
    geminiApiKey: string | null;
    geminiModel: string | null;
    localLlmUrl: string | null;
    localLlmModel: string | null;
  };
}

// ─── Normalized ingest shapes (what adapters produce, the core stores) ──────────

export interface RawMessageItem {
  externalId: string;
  direction: "inbound" | "outbound";
  authorLabel: string;
  body: string;
  createdAt: Date;
}

export interface RawConversationItem {
  /** Stable per-source id (Discord channelId, Gmail threadId, "reddit:<postId>", …). */
  externalId: string;
  customerLabel: string;
  subject: string;
  /** Card preview; the core also refreshes it when new messages land. */
  preview?: string;
  receivedAt: Date;
  tags: string[];
  /** Refresh tags on an existing conversation (e.g. keyword-config sync). */
  refreshTags?: boolean;
  /** Canonical native-thread URL — powers the "Open in {channel}" deep-link. */
  externalUrl?: string;
  /** Discord guild id, persisted so the channel deep-link can be rebuilt. */
  externalGuildId?: string;
  messages: RawMessageItem[];
}

/** Pre-store diagnostics from a fetch (the core adds `duplicate` while storing). */
export interface FetchDiagnostics {
  fetched: number;
  filterReasons: FilterReasons;
  hints: string[];
  errors: string[];
}

export interface ChannelFetchResult {
  items: RawConversationItem[];
  diagnostics: FetchDiagnostics;
  /** Shallow-merged into the connection's scraperConfig (e.g. Discord per-channel cursors). */
  configPatch?: Record<string, unknown>;
}

/**
 * One support channel (Discord, Reddit, Gmail, App reviews, Webhook, …).
 *
 * Preferred path: implement `fetchItems` — return normalized items and let the shared
 * core (`runChannelSync`) handle upsert + dedup + diagnostics + cursor persistence.
 *
 * Escape hatch: implement `run` for adapters not yet migrated to the core (Gmail keeps
 * its self-contained DWD auth + thread-walk). An adapter provides exactly one of the two.
 */
export interface ChannelAdapter {
  key: string;
  fetchItems?(ctx: SyncContext): Promise<ChannelFetchResult>;
  run?(ctx: SyncContext): Promise<SyncResult>;
  sendReply?(ctx: SyncContext, externalId: string, body: string): Promise<void>;
}
