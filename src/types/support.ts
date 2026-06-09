export type SupportSource =
  | "gmail"
  | "reddit"
  | "instagram"
  | "youtube"
  | "discord"
  | "clickup"
  | "stripe"
  | "analytics";

export type ConnectionHealth = "connected" | "needs_setup" | "error";
export type ConversationSentiment = "positive" | "neutral" | "negative";
export type TicketStatus = "open" | "in_progress" | "dev_review" | "awaiting_customer" | "resolved";
export type TicketPriority = "urgent" | "high" | "normal" | "low";
export type DraftType = "reply" | "stripe_cancel" | "stripe_refund";
export type DraftRisk = "low" | "medium" | "high";
export type UserRole = "owner" | "staff";

export interface SupportClient {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  supportDaysPerMonth?: number;
  supportDaysUsed?: number;
  reportingRecipient?: string;
  reportDueDay?: number;
  workspaceClientId?: string;
  unreadCount?: number;
}

export interface SupportUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  assignedClientIds: string[];
}

export interface Connection {
  id: string;
  clientId: string;
  source: SupportSource;
  label: string;
  authMode: "oauth" | "bot_token" | "manual" | "api_key";
  health: ConnectionHealth;
  secretRef?: string;
  nextStep?: string;
  connectedEmail?: string;
  /** ISO timestamp of the last sync run (from the server). */
  lastSyncedAt?: string;
  /** Compact summary of the last sync run, for the Sync Health card. */
  lastSyncStats?: {
    fetched?: number | null;
    ingested: number;
    filtered: number;
    /** Per-reason breakdown of `filtered` (bots / empty / duplicate / excluded). */
    filterReasons?: {
      bots?: number;
      empty?: number;
      duplicate?: number;
      excluded?: number;
    } | null;
    /** Actionable diagnostics surfaced on the connector card. */
    hints?: string[];
    errors: string[];
    at: string;
  };
  scraperConfig?: {
    // Gmail
    query?: string;
    intakeAddress?: string;
    impersonateEmail?: string;
    // Discord
    guildId?: string;
    guildName?: string;
    channelIds?: string[];
    channels?: Array<{ id: string; name: string; lastMessageId?: string | null }>;
    botToken?: string;
    // Reddit
    subreddit?: string;
    // YouTube
    youtubeChannelId?: string;
    videoIds?: string[];
    // Analytics API (product metrics for monthly reports)
    adapter?: string;       // adapter key: "fellas" | "bigwedge" | "firebase" | "generic"
    baseUrl?: string;       // API base URL (or full endpoint for the generic adapter)
    apiToken?: string;      // bearer token, stored server-side on the connection
    serviceAccountJson?: string;  // Firebase: service-account JSON (stored server-side)
    firebaseMetrics?: Array<{     // Firebase: collections to count per month
      label: string;
      collection: string;
      timestampField: string;
      collectionGroup?: boolean;
      group?: string;
      unit?: string;
      where?: Array<{ field: string; value: string | number | boolean }>;
    }>;
    // ── Shared filters (apply to all sources) ──
    keywords?: string[];          // include — only ingest items matching at least one
    excludeKeywords?: string[];   // exclude — drop items matching any
    lookbackDays?: number;        // how far back to pull on first sync / re-sync
    maxItems?: number;            // cap items fetched per sync
    ignoreBots?: boolean;         // Discord only — skip bot-authored messages (default true)
    // Legacy / generic
    intervalHours?: number;
    channelId?: string;
  };
}

export interface Conversation {
  id: string;
  clientId: string;
  source: SupportSource;
  customerLabel: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
  tags: string[];
  sentiment: ConversationSentiment;
  ticketId?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  authorLabel: string;
  body: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  clientId: string;
  title: string;
  customerLabel: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: SupportSource;
  nextAction: string;
  issueType: string;
  updatedAt: string;
  assignedTo: string;
  resolvedAt?: string;
  firstReplyAt?: string;
}

export interface DraftAction {
  id: string;
  clientId: string;
  ticketId: string;
  type: DraftType;
  title: string;
  body: string;
  status: "pending_approval" | "approved" | "rejected" | "sent";
  risk: DraftRisk;
}

export interface WorkflowRule {
  id: string;
  clientId: string;
  name: string;
  when: string;
  then: string;
  requiresApproval: boolean;
}

export interface AuditLog {
  id: string;
  clientId: string;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
}

export interface SupportReportPayload {
  author: string;
  periodStart: string;
  periodEnd: string;
  // Overview narrative
  overviewText: string;
  // Ticket stats by category
  totalTickets: number;
  catCancellations: number;
  catAccountQueries: number;
  catRefunds: number;
  catTechIssues: number;
  catOther: number;
  // Priority breakdown
  prioUrgent: number;
  prioHigh: number;
  prioMedium: number;
  prioLow: number;
  // Support performance narrative
  performanceText: string;
  // Refund section
  refundRequests: number;
  refundsProcessed: number;
  refundTotalValue: number;
  refundNotes: string;
  // Usage analytics — flexible per-client metrics, auto-filled from the client's
  // analytics connection (or entered manually). Each carries the previous month's
  // value so the report can show a trend.
  metrics?: AnalyticsReportMetric[];
  // AI-written one-paragraph trend summary of the metrics ("Subscribers up 12%…").
  analyticsNarrative?: string;
  // Summary narrative
  summaryText: string;
}

/** One analytics figure captured on a report (mirrors AnalyticsMetric server-side). */
export interface AnalyticsReportMetric {
  key: string;
  label: string;
  value: number;
  previous?: number;
  unit?: string;
  group?: string;
}

export interface SupportReport {
  id: string;
  clientId: string;
  period: string;
  payload: SupportReportPayload;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportData {
  clients: SupportClient[];
  users: SupportUser[];
  connections: Connection[];
  conversations: Conversation[];
  messages: Message[];
  tickets: Ticket[];
  draftActions: DraftAction[];
  workflowRules: WorkflowRule[];
  auditLogs: AuditLog[];
}
