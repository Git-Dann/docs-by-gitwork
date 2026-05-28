export type SupportSource =
  | "gmail"
  | "reddit"
  | "instagram"
  | "youtube"
  | "discord"
  | "clickup"
  | "stripe";

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
  scraperConfig?: {
    // Gmail
    query?: string;
    intakeAddress?: string;
    // Discord
    guildId?: string;
    guildName?: string;
    channelIds?: string[];
    channels?: Array<{ id: string; name: string; lastMessageId?: string | null }>;
    botToken?: string;
    // Reddit
    subreddit?: string;
    clientId?: string;
    clientSecret?: string;
    keywords?: string[];
    // YouTube
    youtubeChannelId?: string;
    videoIds?: string[];
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
