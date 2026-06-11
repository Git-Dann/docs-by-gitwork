import type {
  ConnectionHealth,
  SupportSource,
  TicketStatus,
  TicketPriority,
  DraftType,
  DraftRisk,
  SupportClient,
  Connection,
  Conversation,
  Message,
  Ticket,
  DraftAction,
  WorkflowRule,
  AuditLog,
  SupportReport,
  SupportReportPayload,
} from "@/types/support";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { encrypt, decrypt } from "@/lib/encryption";
import type {
  SupportClientStatus,
  SupportSource as PrismaSupportSource,
  ConnectionHealth as PrismaConnectionHealth,
  ConnectionAuthMode,
  ConversationSentiment as PrismaConversationSentiment,
  SupportTicketStatus,
  SupportTicketPriority,
  DraftActionType,
  DraftActionStatus,
  DraftActionRisk,
} from "@prisma/client";

// ─── Enum mappers: Prisma → frontend ─────────────────────────────────────────

function mapSource(v: PrismaSupportSource): SupportSource {
  return v.toLowerCase() as SupportSource;
}

function mapHealth(v: PrismaConnectionHealth): ConnectionHealth {
  switch (v) {
    case "CONNECTED": return "connected";
    case "NEEDS_SETUP": return "needs_setup";
    case "ERROR": return "error";
  }
}

function mapAuthMode(v: ConnectionAuthMode): Connection["authMode"] {
  switch (v) {
    case "OAUTH": return "oauth";
    case "BOT_TOKEN": return "bot_token";
    case "MANUAL": return "manual";
    case "API_KEY": return "api_key";
  }
}

function mapTicketStatus(v: SupportTicketStatus): TicketStatus {
  switch (v) {
    case "OPEN": return "open";
    case "IN_PROGRESS": return "in_progress";
    case "DEV_REVIEW": return "dev_review";
    case "AWAITING_CUSTOMER": return "awaiting_customer";
    case "RESOLVED": return "resolved";
  }
}

function mapTicketPriority(v: SupportTicketPriority): TicketPriority {
  return v.toLowerCase() as TicketPriority;
}

function mapDraftType(v: DraftActionType): DraftType {
  switch (v) {
    case "REPLY": return "reply";
    case "STRIPE_CANCEL": return "stripe_cancel";
    case "STRIPE_REFUND": return "stripe_refund";
  }
}

function mapDraftStatus(v: DraftActionStatus): DraftAction["status"] {
  switch (v) {
    case "PENDING_APPROVAL": return "pending_approval";
    case "APPROVED": return "approved";
    case "REJECTED": return "rejected";
    case "SENT": return "sent";
  }
}

function mapDraftRisk(v: DraftActionRisk): DraftRisk {
  return v.toLowerCase() as DraftRisk;
}

function mapSentiment(v: PrismaConversationSentiment): Conversation["sentiment"] {
  return v.toLowerCase() as Conversation["sentiment"];
}

function mapClientStatus(v: SupportClientStatus): SupportClient["status"] {
  return v.toLowerCase() as SupportClient["status"];
}

// ─── Enum mappers: frontend → Prisma ─────────────────────────────────────────

function toDbSource(v: SupportSource): PrismaSupportSource {
  return v.toUpperCase() as PrismaSupportSource;
}

function toDbHealth(v: ConnectionHealth): PrismaConnectionHealth {
  switch (v) {
    case "connected": return "CONNECTED";
    case "needs_setup": return "NEEDS_SETUP";
    case "error": return "ERROR";
  }
}

function toDbAuthMode(v: Connection["authMode"]): ConnectionAuthMode {
  switch (v) {
    case "oauth": return "OAUTH";
    case "bot_token": return "BOT_TOKEN";
    case "manual": return "MANUAL";
    case "api_key": return "API_KEY";
  }
}

function toDbTicketStatus(v: TicketStatus): SupportTicketStatus {
  switch (v) {
    case "open": return "OPEN";
    case "in_progress": return "IN_PROGRESS";
    case "dev_review": return "DEV_REVIEW";
    case "awaiting_customer": return "AWAITING_CUSTOMER";
    case "resolved": return "RESOLVED";
  }
}

function toDbTicketPriority(v: TicketPriority): SupportTicketPriority {
  return v.toUpperCase() as SupportTicketPriority;
}

function toDbDraftType(v: DraftType): DraftActionType {
  switch (v) {
    case "reply": return "REPLY";
    case "stripe_cancel": return "STRIPE_CANCEL";
    case "stripe_refund": return "STRIPE_REFUND";
  }
}

function toDbDraftStatus(v: DraftAction["status"]): DraftActionStatus {
  switch (v) {
    case "pending_approval": return "PENDING_APPROVAL";
    case "approved": return "APPROVED";
    case "rejected": return "REJECTED";
    case "sent": return "SENT";
  }
}

function toDbDraftRisk(v: DraftRisk): DraftActionRisk {
  return v.toUpperCase() as DraftActionRisk;
}

// ─── Serializers ─────────────────────────────────────────────────────────────

export function serializeSupportClient(row: {
  id: string;
  name: string;
  slug: string;
  status: SupportClientStatus;
  supportDaysPerMonth: number | null;
  supportDaysUsed: number | null;
  reportingRecipient: string | null;
  reportDueDay: number | null;
  workspaceClientId?: string | null;
  _count?: { conversations?: number };
}): SupportClient {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: mapClientStatus(row.status),
    supportDaysPerMonth: row.supportDaysPerMonth ?? undefined,
    supportDaysUsed: row.supportDaysUsed ?? undefined,
    reportingRecipient: row.reportingRecipient ?? undefined,
    reportDueDay: row.reportDueDay ?? undefined,
    workspaceClientId: row.workspaceClientId ?? undefined,
    unreadCount: row._count?.conversations ?? 0,
  };
}

// ─── Scraper config encryption helpers ───────────────────────────────────────

const SENSITIVE_SCRAPER_KEYS = ["botToken", "serviceAccountJson", "apiToken", "webhookToken"];

/**
 * Encrypts sensitive values in a scraperConfig object using AES-256-GCM.
 * No-ops when ENCRYPTION_KEY is not set, so existing deployments are unaffected
 * until the key is provisioned.
 */
export function encryptScraperConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!process.env.ENCRYPTION_KEY) return config;
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) =>
      SENSITIVE_SCRAPER_KEYS.includes(k) && typeof v === "string" && v && !v.startsWith("enc:")
        ? [k, `enc:${encrypt(v)}`]
        : [k, v],
    ),
  );
}

/**
 * Decrypts `enc:…` values in a scraperConfig object. Plain-text values (legacy or
 * unset ENCRYPTION_KEY) are returned as-is.
 */
export function decryptScraperConfig(
  config: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!config) return null;
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => {
      if (typeof v === "string" && v.startsWith("enc:")) {
        try {
          return [k, decrypt(v.slice(4))];
        } catch {
          return [k, ""];  // decryption failure → empty (won't expose ciphertext)
        }
      }
      return [k, v];
    }),
  );
}

export function serializeConnection(row: {
  id: string;
  clientId: string;
  source: PrismaSupportSource;
  label: string;
  authMode: ConnectionAuthMode;
  health: PrismaConnectionHealth;
  secretRef: string | null;
  nextStep: string | null;
  scraperConfig: unknown;
  lastSyncedAt?: Date | null;
  lastSyncStats?: unknown;
  channelTokens?: Array<{ tokenData: unknown }>;
}): Connection {
  const decryptedConfig = decryptScraperConfig(row.scraperConfig as Record<string, unknown> | null);

  const connectedEmail = (() => {
    if (typeof decryptedConfig?.impersonateEmail === "string") return decryptedConfig.impersonateEmail;
    const token = row.channelTokens?.[0];
    if (!token) return undefined;
    const td = token.tokenData as Record<string, unknown>;
    return typeof td?.email === "string" ? td.email : undefined;
  })();

  return {
    id: row.id,
    clientId: row.clientId,
    source: mapSource(row.source),
    label: row.label,
    authMode: mapAuthMode(row.authMode),
    health: mapHealth(row.health),
    secretRef: row.secretRef ?? undefined,
    nextStep: row.nextStep ?? undefined,
    connectedEmail,
    scraperConfig: decryptedConfig
      ? (decryptedConfig as Connection["scraperConfig"])
      : undefined,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : undefined,
    lastSyncStats: (row.lastSyncStats as Connection["lastSyncStats"]) ?? undefined,
  };
}

export function serializeConversation(row: {
  id: string;
  clientId: string;
  source: PrismaSupportSource;
  customerLabel: string;
  subject: string;
  preview: string | null;
  receivedAt: Date;
  unread: boolean;
  tags: string[];
  sentiment: PrismaConversationSentiment;
  tickets?: Array<{ id: string }>;
}): Conversation {
  return {
    id: row.id,
    clientId: row.clientId,
    source: mapSource(row.source),
    customerLabel: row.customerLabel,
    subject: row.subject,
    preview: row.preview ?? "",
    receivedAt: row.receivedAt.toISOString(),
    unread: row.unread,
    tags: row.tags,
    sentiment: mapSentiment(row.sentiment),
    ticketId: row.tickets?.[0]?.id,
  };
}

export function serializeMessage(row: {
  id: string;
  conversationId: string;
  direction: string;
  authorLabel: string;
  body: string;
  createdAt: Date;
}): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction as Message["direction"],
    authorLabel: row.authorLabel,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeTicket(row: {
  id: string;
  clientId: string;
  title: string;
  customerLabel: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  source: PrismaSupportSource;
  nextAction: string | null;
  issueType: string | null;
  updatedAt: Date;
  assignedTo: string | null;
  resolvedAt?: Date | null;
  firstReplyAt?: Date | null;
  csatScore?: number | null;
}): Ticket {
  return {
    id: row.id,
    clientId: row.clientId,
    title: row.title,
    customerLabel: row.customerLabel,
    status: mapTicketStatus(row.status),
    priority: mapTicketPriority(row.priority),
    source: mapSource(row.source),
    nextAction: row.nextAction ?? "",
    issueType: row.issueType ?? "",
    updatedAt: row.updatedAt.toISOString(),
    assignedTo: row.assignedTo ?? "",
    resolvedAt: row.resolvedAt?.toISOString(),
    firstReplyAt: row.firstReplyAt?.toISOString(),
    csatScore: row.csatScore ?? null,
  };
}

export function serializeDraftAction(row: {
  id: string;
  clientId: string;
  ticketId: string | null;
  type: DraftActionType;
  title: string;
  body: string;
  status: DraftActionStatus;
  risk: DraftActionRisk;
}): DraftAction {
  return {
    id: row.id,
    clientId: row.clientId,
    ticketId: row.ticketId ?? "",
    type: mapDraftType(row.type),
    title: row.title,
    body: row.body,
    status: mapDraftStatus(row.status),
    risk: mapDraftRisk(row.risk),
  };
}

export function serializeWorkflowRule(row: {
  id: string;
  clientId: string;
  name: string;
  triggerText: string;
  actionsText: string;
  requiresApproval: boolean;
}): WorkflowRule {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    when: row.triggerText,
    then: row.actionsText,
    requiresApproval: row.requiresApproval,
  };
}

export function serializeAuditLog(row: {
  id: string;
  clientId: string;
  actorId: string | null;
  action: string;
  target: string | null;
  createdAt: Date;
}): AuditLog {
  return {
    id: row.id,
    clientId: row.clientId,
    actor: row.actorId ?? "System",
    action: row.action,
    target: row.target ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Workspace helper ─────────────────────────────────────────────────────────

export async function getWorkspaceId(): Promise<string> {
  const { workspace } = await ensureBaseRecords();
  return workspace.id;
}

// ─── SupportClient CRUD ───────────────────────────────────────────────────────

export async function listSupportClients(): Promise<SupportClient[]> {
  const workspaceId = await getWorkspaceId();
  const rows = await prisma.supportClient.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { conversations: { where: { unread: true } } } },
    },
  });
  return rows.map(serializeSupportClient);
}

// ─── Dashboard aggregation ───────────────────────────────────────────────────
// Single round-trip replacement for fanning out listClients → listTickets per
// client → listConversations per client. Used by the iOS dashboard.

export type SupportDashboardSummary = {
  clientCount: number;
  openTicketCount: number;
  recentConversations: Array<
    Conversation & { client: SupportClient }
  >;
};

export async function getSupportDashboardSummary(options?: {
  recentConversationLimit?: number;
}): Promise<SupportDashboardSummary> {
  const workspaceId = await getWorkspaceId();
  const limit = options?.recentConversationLimit ?? 8;

  const [clientCount, openTicketCount, conversationRows] = await Promise.all([
    prisma.supportClient.count({ where: { workspaceId } }),
    prisma.supportTicket.count({
      where: { status: "OPEN", client: { workspaceId } },
    }),
    prisma.supportConversation.findMany({
      where: { client: { workspaceId } },
      orderBy: { receivedAt: "desc" },
      take: limit,
      include: {
        client: true,
        tickets: { select: { id: true }, take: 1 },
      },
    }),
  ]);

  return {
    clientCount,
    openTicketCount,
    recentConversations: conversationRows.map((row) => ({
      ...serializeConversation(row),
      client: serializeSupportClient(row.client),
    })),
  };
}

export async function getSupportClient(clientId: string): Promise<SupportClient> {
  const row = await prisma.supportClient.findUniqueOrThrow({
    where: { id: clientId },
  });
  return serializeSupportClient(row);
}

export async function createSupportClient(data: {
  name: string;
  slug: string;
  status?: SupportClient["status"];
  supportDaysPerMonth?: number;
  supportDaysUsed?: number;
  reportingRecipient?: string;
  reportDueDay?: number;
  workspaceClientId?: string;
}): Promise<SupportClient> {
  const workspaceId = await getWorkspaceId();
  const row = await prisma.supportClient.create({
    data: {
      workspaceId,
      name: data.name,
      slug: data.slug,
      status: data.status ? (data.status.toUpperCase() as SupportClientStatus) : "ACTIVE",
      supportDaysPerMonth: data.supportDaysPerMonth ?? null,
      supportDaysUsed: data.supportDaysUsed ?? null,
      reportingRecipient: data.reportingRecipient ?? null,
      reportDueDay: data.reportDueDay ?? null,
      workspaceClientId: data.workspaceClientId ?? null,
    },
  });
  return serializeSupportClient(row);
}

export async function updateSupportClient(
  clientId: string,
  data: Partial<{
    name: string;
    slug: string;
    status: SupportClient["status"];
    supportDaysPerMonth: number;
    supportDaysUsed: number;
    reportingRecipient: string;
    reportDueDay: number;
    workspaceClientId: string | null;
  }>,
): Promise<SupportClient> {
  const row = await prisma.supportClient.update({
    where: { id: clientId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.status !== undefined
        ? { status: data.status.toUpperCase() as SupportClientStatus }
        : {}),
      ...(data.supportDaysPerMonth !== undefined
        ? { supportDaysPerMonth: data.supportDaysPerMonth }
        : {}),
      ...(data.supportDaysUsed !== undefined
        ? { supportDaysUsed: data.supportDaysUsed }
        : {}),
      ...(data.reportingRecipient !== undefined
        ? { reportingRecipient: data.reportingRecipient }
        : {}),
      ...(data.reportDueDay !== undefined ? { reportDueDay: data.reportDueDay } : {}),
      ...("workspaceClientId" in data
        ? { workspaceClientId: data.workspaceClientId ?? null }
        : {}),
    },
  });
  return serializeSupportClient(row);
}

export async function deleteSupportClient(clientId: string): Promise<void> {
  await prisma.supportClient.delete({ where: { id: clientId } });
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function listConversations(
  clientId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ conversations: Conversation[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 100, 200);
  const rows = await prisma.supportConversation.findMany({
    where: { clientId },
    include: { tickets: { select: { id: true }, take: 1 } },
    orderBy: { receivedAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    conversations: page.map(serializeConversation),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function getConversation(convId: string): Promise<Conversation> {
  const row = await prisma.supportConversation.findUniqueOrThrow({
    where: { id: convId },
    include: { tickets: { select: { id: true }, take: 1 } },
  });
  return serializeConversation(row);
}

export async function createConversation(
  clientId: string,
  data: {
    source: SupportSource;
    customerLabel: string;
    subject: string;
    preview?: string;
    receivedAt?: string;
    unread?: boolean;
    tags?: string[];
    sentiment?: Conversation["sentiment"];
  },
): Promise<Conversation> {
  const row = await prisma.supportConversation.create({
    data: {
      clientId,
      source: toDbSource(data.source),
      customerLabel: data.customerLabel,
      subject: data.subject,
      preview: data.preview ?? null,
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
      unread: data.unread ?? true,
      tags: data.tags ?? [],
      sentiment: data.sentiment
        ? (data.sentiment.toUpperCase() as PrismaConversationSentiment)
        : "NEUTRAL",
    },
    include: { tickets: { select: { id: true }, take: 1 } },
  });
  return serializeConversation(row);
}

export async function updateConversation(
  convId: string,
  data: Partial<{
    unread: boolean;
    tags: string[];
    sentiment: Conversation["sentiment"];
    subject: string;
    preview: string;
  }>,
): Promise<Conversation> {
  const row = await prisma.supportConversation.update({
    where: { id: convId },
    data: {
      ...(data.unread !== undefined ? { unread: data.unread } : {}),
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
      ...(data.sentiment !== undefined
        ? { sentiment: data.sentiment.toUpperCase() as PrismaConversationSentiment }
        : {}),
      ...(data.subject !== undefined ? { subject: data.subject } : {}),
      ...(data.preview !== undefined ? { preview: data.preview } : {}),
    },
    include: { tickets: { select: { id: true }, take: 1 } },
  });
  return serializeConversation(row);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function listMessages(convId: string): Promise<Message[]> {
  const rows = await prisma.supportMessage.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeMessage);
}

export async function createMessage(
  convId: string,
  data: {
    direction: "inbound" | "outbound";
    authorLabel: string;
    body: string;
  },
): Promise<Message> {
  const row = await prisma.supportMessage.create({
    data: {
      conversationId: convId,
      direction: data.direction,
      authorLabel: data.authorLabel,
      body: data.body,
    },
  });

  // Stamp firstReplyAt on any linked ticket the first time an outbound message is sent.
  if (data.direction === "outbound") {
    const ticket = await prisma.supportTicket.findFirst({
      where: { conversationId: convId, firstReplyAt: null },
      select: { id: true },
    });
    if (ticket) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { firstReplyAt: row.createdAt },
      });
    }
  }

  return serializeMessage(row);
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export async function listTickets(
  clientId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ tickets: Ticket[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 100, 200);
  const rows = await prisma.supportTicket.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    tickets: page.map(serializeTicket),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function getTicket(ticketId: string): Promise<Ticket> {
  const row = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
  return serializeTicket(row);
}

export async function createTicket(
  clientId: string,
  data: {
    title: string;
    customerLabel: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    source: SupportSource;
    nextAction?: string;
    issueType?: string;
    assignedTo?: string;
    conversationId?: string;
  },
): Promise<Ticket> {
  const row = await prisma.supportTicket.create({
    data: {
      clientId,
      title: data.title,
      customerLabel: data.customerLabel,
      status: data.status ? toDbTicketStatus(data.status) : "OPEN",
      priority: data.priority ? toDbTicketPriority(data.priority) : "NORMAL",
      source: toDbSource(data.source),
      nextAction: data.nextAction ?? null,
      issueType: data.issueType ?? null,
      assignedTo: data.assignedTo ?? null,
      conversationId: data.conversationId ?? null,
    },
  });
  return serializeTicket(row);
}

export async function updateTicket(
  ticketId: string,
  data: Partial<{
    title: string;
    customerLabel: string;
    status: TicketStatus;
    priority: TicketPriority;
    source: SupportSource;
    nextAction: string;
    issueType: string;
    assignedTo: string;
    csatScore: number | null;
  }>,
): Promise<Ticket> {
  const row = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.customerLabel !== undefined ? { customerLabel: data.customerLabel } : {}),
      ...(data.status !== undefined ? { status: toDbTicketStatus(data.status) } : {}),
      ...(data.status === "resolved" ? { resolvedAt: new Date() } : {}),
      ...(data.priority !== undefined ? { priority: toDbTicketPriority(data.priority) } : {}),
      ...(data.source !== undefined ? { source: toDbSource(data.source) } : {}),
      ...(data.nextAction !== undefined ? { nextAction: data.nextAction } : {}),
      ...(data.issueType !== undefined ? { issueType: data.issueType } : {}),
      ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo } : {}),
      ...(data.csatScore !== undefined ? { csatScore: data.csatScore } : {}),
    },
  });
  return serializeTicket(row);
}

export async function deleteTicket(ticketId: string): Promise<void> {
  await prisma.supportTicket.delete({ where: { id: ticketId } });
}

// ─── Ticket stats for report pre-fill ────────────────────────────────────────

export async function getTicketStatsForPeriod(
  clientId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{
  totalTickets: number;
  catCancellations: number;
  catAccountQueries: number;
  catRefunds: number;
  catTechIssues: number;
  catOther: number;
  prioUrgent: number;
  prioHigh: number;
  prioMedium: number;
  prioLow: number;
}> {
  const start = new Date(periodStart);
  const end = new Date(periodEnd + "T23:59:59.999Z");

  const tickets = await prisma.supportTicket.findMany({
    where: { clientId, updatedAt: { gte: start, lte: end } },
    select: { issueType: true, priority: true },
  });

  const result = {
    totalTickets: tickets.length,
    catCancellations: 0,
    catAccountQueries: 0,
    catRefunds: 0,
    catTechIssues: 0,
    catOther: 0,
    prioUrgent: 0,
    prioHigh: 0,
    prioMedium: 0,
    prioLow: 0,
  };

  for (const t of tickets) {
    const it = (t.issueType ?? "").toLowerCase();
    if (it.includes("cancel") || it.includes("churn")) result.catCancellations++;
    else if (it.includes("billing") || it.includes("refund") || it.includes("payment")) result.catRefunds++;
    else if (it.includes("account") || it.includes("login") || it.includes("password")) result.catAccountQueries++;
    else if (it.includes("tech") || it.includes("bug") || it.includes("crash") || it.includes("error")) result.catTechIssues++;
    else result.catOther++;

    switch (t.priority) {
      case "URGENT": result.prioUrgent++; break;
      case "HIGH": result.prioHigh++; break;
      case "NORMAL": result.prioMedium++; break;
      case "LOW": result.prioLow++; break;
    }
  }

  return result;
}

// ─── Performance metrics ──────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute support-desk performance for a period from ticket timestamps. Tickets are
 * scoped by createdAt so the figures describe work that *arrived* in the window. All
 * times are derived from the firstReplyAt / resolvedAt stamps already maintained by
 * createMessage() and updateTicket(); nothing new is persisted.
 *
 * `slaTargetHours` defaults to 4h — Zendesk's "good" first-response tier (best-in-class
 * is <1h, acceptable is <12h), a sensible agency benchmark.
 */
export async function getPerformanceMetricsForPeriod(
  clientId: string,
  periodStart: string,
  periodEnd: string,
  slaTargetHours = 4,
): Promise<import("@/types/support").SupportPerformanceMetrics> {
  const start = new Date(periodStart);
  const end = new Date(periodEnd + "T23:59:59.999Z");

  const tickets = await prisma.supportTicket.findMany({
    where: { clientId, createdAt: { gte: start, lte: end } },
    select: { createdAt: true, firstReplyAt: true, resolvedAt: true, status: true, csatScore: true },
  });

  const frtMs: number[] = [];
  const resolutionMs: number[] = [];
  const csatScores: number[] = [];
  let respondedCount = 0;
  let resolvedCount = 0;
  let withinSla = 0;
  const slaTargetMs = slaTargetHours * 3600_000;

  for (const t of tickets) {
    if (t.firstReplyAt) {
      const ms = t.firstReplyAt.getTime() - t.createdAt.getTime();
      if (ms >= 0) {
        frtMs.push(ms);
        respondedCount++;
        if (ms <= slaTargetMs) withinSla++;
      }
    }
    if (t.resolvedAt || t.status === "RESOLVED") {
      resolvedCount++;
      if (t.resolvedAt) {
        const ms = t.resolvedAt.getTime() - t.createdAt.getTime();
        if (ms >= 0) resolutionMs.push(ms);
      }
    }
    if (t.csatScore != null && t.csatScore >= 1 && t.csatScore <= 5) {
      csatScores.push(t.csatScore);
    }
  }

  const avgCsat =
    csatScores.length > 0
      ? Math.round((csatScores.reduce((a, b) => a + b, 0) / csatScores.length) * 10) / 10
      : null;

  const total = tickets.length;
  return {
    totalTickets: total,
    respondedCount,
    resolvedCount,
    openCount: total - resolvedCount,
    resolutionRate: total > 0 ? Math.round((resolvedCount / total) * 100) : 0,
    avgFirstResponseMs: mean(frtMs),
    medianFirstResponseMs: median(frtMs),
    avgResolutionMs: mean(resolutionMs),
    medianResolutionMs: median(resolutionMs),
    slaFrtCompliancePct: respondedCount > 0 ? Math.round((withinSla / respondedCount) * 100) : null,
    slaTargetHours,
    avgCsatScore: avgCsat,
  };
}

// ─── Account health score ─────────────────────────────────────────────────────

export async function getClientHealthScore(
  clientId: string,
): Promise<import("@/types/support").ClientHealthScore> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600_000);

  const [tickets, conversations] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { clientId, createdAt: { gte: thirtyDaysAgo } },
      select: { status: true, priority: true, firstReplyAt: true, createdAt: true },
    }),
    prisma.supportConversation.findMany({
      where: { clientId, receivedAt: { gte: thirtyDaysAgo } },
      select: { sentiment: true },
    }),
  ]);

  // Factor 1: FRT performance (30 pts)
  const frtMs = tickets
    .filter((t) => t.firstReplyAt)
    .map((t) => t.firstReplyAt!.getTime() - t.createdAt.getTime())
    .filter((ms) => ms >= 0);
  const avgFrt = frtMs.length > 0 ? frtMs.reduce((a, b) => a + b, 0) / frtMs.length : null;
  let frtScore = 20; // neutral when no data
  let frtNote = "No replies yet";
  if (avgFrt !== null) {
    const h = avgFrt / 3_600_000;
    if (h <= 1) { frtScore = 30; frtNote = `Avg ${(h * 60).toFixed(0)}m — excellent`; }
    else if (h <= 4) { frtScore = 20; frtNote = `Avg ${h.toFixed(1)}h — good`; }
    else if (h <= 24) { frtScore = 10; frtNote = `Avg ${h.toFixed(1)}h — needs work`; }
    else { frtScore = 0; frtNote = `Avg ${(h / 24).toFixed(1)}d — very slow`; }
  }

  // Factor 2: Resolution rate (25 pts)
  const total = tickets.length;
  const resolved = tickets.filter((t) => t.status === "RESOLVED").length;
  const resRate = total > 0 ? (resolved / total) * 100 : null;
  let resScore = 18; // neutral when no data
  let resNote = "No tickets yet";
  if (resRate !== null) {
    if (resRate >= 80) { resScore = 25; resNote = `${Math.round(resRate)}% resolved`; }
    else if (resRate >= 70) { resScore = 18; resNote = `${Math.round(resRate)}% resolved`; }
    else if (resRate >= 50) { resScore = 10; resNote = `${Math.round(resRate)}% resolved`; }
    else { resScore = 4; resNote = `${Math.round(resRate)}% resolved — low`; }
  }

  // Factor 3: Sentiment (25 pts)
  const sentTotal = conversations.length;
  const negCount = conversations.filter((c) => c.sentiment === "NEGATIVE").length;
  const negPct = sentTotal > 0 ? (negCount / sentTotal) * 100 : null;
  let sentScore = 18; // neutral when no data
  let sentNote = "No conversations yet";
  if (negPct !== null) {
    if (negPct <= 10) { sentScore = 25; sentNote = `${Math.round(negPct)}% negative — healthy`; }
    else if (negPct <= 20) { sentScore = 18; sentNote = `${Math.round(negPct)}% negative`; }
    else if (negPct <= 35) { sentScore = 10; sentNote = `${Math.round(negPct)}% negative — elevated`; }
    else { sentScore = 3; sentNote = `${Math.round(negPct)}% negative — critical`; }
  }

  // Factor 4: Open urgency — count of open urgent/high tickets (20 pts)
  const urgentOpen = tickets.filter(
    (t) => t.status !== "RESOLVED" && (t.priority === "URGENT" || t.priority === "HIGH"),
  ).length;
  let urgScore: number;
  let urgNote: string;
  if (urgentOpen === 0) { urgScore = 20; urgNote = "No urgent/high open tickets"; }
  else if (urgentOpen === 1) { urgScore = 14; urgNote = `${urgentOpen} urgent/high ticket open`; }
  else if (urgentOpen <= 3) { urgScore = 7; urgNote = `${urgentOpen} urgent/high tickets open`; }
  else { urgScore = 0; urgNote = `${urgentOpen} urgent/high tickets open`; }

  const score = frtScore + resScore + sentScore + urgScore;
  const tier: import("@/types/support").ClientHealthScore["tier"] =
    score >= 75 ? "healthy" : score >= 50 ? "watch" : "at_risk";

  return {
    score,
    tier,
    factors: [
      { label: "First response", score: frtScore, maxScore: 30, note: frtNote },
      { label: "Resolution rate", score: resScore, maxScore: 25, note: resNote },
      { label: "Sentiment", score: sentScore, maxScore: 25, note: sentNote },
      { label: "Open urgency", score: urgScore, maxScore: 20, note: urgNote },
    ],
    computedAt: now.toISOString(),
  };
}

// ─── Batch ticket update ──────────────────────────────────────────────────────

export async function batchUpdateTickets(
  clientId: string,
  ticketIds: string[],
  data: Partial<{ status: TicketStatus; priority: TicketPriority; assignedTo: string }>,
): Promise<{ updated: number }> {
  const result = await prisma.supportTicket.updateMany({
    where: { id: { in: ticketIds }, clientId },
    data: {
      ...(data.status ? { status: toDbTicketStatus(data.status), ...(data.status === "resolved" ? { resolvedAt: new Date() } : {}) } : {}),
      ...(data.priority ? { priority: toDbTicketPriority(data.priority) } : {}),
      ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo || null } : {}),
    },
  });
  return { updated: result.count };
}

// ─── Connections ──────────────────────────────────────────────────────────────

export async function listConnections(clientId: string): Promise<Connection[]> {
  const rows = await prisma.accountConnection.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: { channelTokens: { select: { tokenData: true } } },
  });
  return rows.map(serializeConnection);
}

export async function createConnection(
  clientId: string,
  data: {
    source: SupportSource;
    label: string;
    authMode: Connection["authMode"];
    health?: ConnectionHealth;
    secretRef?: string;
    nextStep?: string;
    scraperConfig?: Connection["scraperConfig"];
  },
): Promise<Connection> {
  const row = await prisma.accountConnection.create({
    data: {
      clientId,
      source: toDbSource(data.source),
      label: data.label,
      authMode: toDbAuthMode(data.authMode),
      health: data.health ? toDbHealth(data.health) : "NEEDS_SETUP",
      secretRef: data.secretRef ?? null,
      nextStep: data.nextStep ?? null,
      scraperConfig: data.scraperConfig
        ? (encryptScraperConfig(data.scraperConfig as Record<string, unknown>) as object)
        : undefined,
    },
  });
  return serializeConnection(row);
}

export async function updateConnection(
  connId: string,
  data: Partial<{
    label: string;
    authMode: Connection["authMode"];
    health: ConnectionHealth;
    secretRef: string;
    nextStep: string;
    scraperConfig: Connection["scraperConfig"];
  }>,
): Promise<Connection> {
  const row = await prisma.accountConnection.update({
    where: { id: connId },
    data: {
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.authMode !== undefined ? { authMode: toDbAuthMode(data.authMode) } : {}),
      ...(data.health !== undefined ? { health: toDbHealth(data.health) } : {}),
      ...(data.secretRef !== undefined ? { secretRef: data.secretRef } : {}),
      ...(data.nextStep !== undefined ? { nextStep: data.nextStep } : {}),
      ...(data.scraperConfig !== undefined
        ? { scraperConfig: encryptScraperConfig(data.scraperConfig as Record<string, unknown>) as object }
        : {}),
    },
  });
  return serializeConnection(row);
}

export async function deleteConnection(connId: string): Promise<void> {
  await prisma.accountConnection.delete({ where: { id: connId } });
}

// ─── Draft Actions ────────────────────────────────────────────────────────────

export async function listDraftActions(clientId: string): Promise<DraftAction[]> {
  const rows = await prisma.draftSupportAction.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeDraftAction);
}

export async function createDraftAction(
  clientId: string,
  data: {
    ticketId?: string;
    type: DraftType;
    title: string;
    body: string;
    status?: DraftAction["status"];
    risk?: DraftRisk;
  },
): Promise<DraftAction> {
  const row = await prisma.draftSupportAction.create({
    data: {
      clientId,
      ticketId: data.ticketId ?? null,
      type: toDbDraftType(data.type),
      title: data.title,
      body: data.body,
      status: data.status ? toDbDraftStatus(data.status) : "PENDING_APPROVAL",
      risk: data.risk ? toDbDraftRisk(data.risk) : "LOW",
    },
  });
  return serializeDraftAction(row);
}

export async function updateDraftAction(
  draftId: string,
  data: Partial<{
    status: DraftAction["status"];
    body: string;
    title: string;
    risk: DraftRisk;
  }>,
): Promise<DraftAction> {
  const row = await prisma.draftSupportAction.update({
    where: { id: draftId },
    data: {
      ...(data.status !== undefined ? { status: toDbDraftStatus(data.status) } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.risk !== undefined ? { risk: toDbDraftRisk(data.risk) } : {}),
    },
  });
  return serializeDraftAction(row);
}

// ─── Workflow Rules ───────────────────────────────────────────────────────────

export async function listWorkflowRules(clientId: string): Promise<WorkflowRule[]> {
  const rows = await prisma.supportWorkflowRule.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeWorkflowRule);
}

export async function createWorkflowRule(
  clientId: string,
  data: {
    name: string;
    when: string;
    then: string;
    requiresApproval?: boolean;
  },
): Promise<WorkflowRule> {
  const row = await prisma.supportWorkflowRule.create({
    data: {
      clientId,
      name: data.name,
      triggerText: data.when,
      actionsText: data.then,
      requiresApproval: data.requiresApproval ?? true,
    },
  });
  return serializeWorkflowRule(row);
}

const DEFAULT_WORKFLOW_RULES: Array<{ name: string; when: string; then: string; requiresApproval: boolean }> = [
  {
    name: "Bug report → ticket",
    when: 'Message contains "bug", "broken", "crash", or "not working", or triage tags the conversation as a bug',
    then: "Create a high-priority ticket tagged `bug`. Draft a response acknowledging the issue and asking for reproduction steps.",
    requiresApproval: true,
  },
  {
    name: "Billing query",
    when: 'Message contains "invoice", "charge", "refund", "payment", or "billing", or triage tags the conversation as billing',
    then: "Create a ticket tagged `billing`. Require human approval before sending any reply.",
    requiresApproval: true,
  },
  {
    name: "Negative sentiment → escalate",
    when: "Triage agent scores the conversation sentiment as negative, or message contains words like \"frustrated\", \"angry\", \"disappointed\", or \"terrible\"",
    then: "Set priority to urgent. Flag conversation as unread. Draft an empathetic apology response for approval.",
    requiresApproval: true,
  },
  {
    name: "Feature request",
    when: 'Message contains "feature", "wish", "could you add", "would love", or "suggestion", or triage tags the conversation as feature_request',
    then: "Tag conversation `feature-request`. Draft a warm acknowledgement thanking them for the feedback. No ticket needed unless priority is high.",
    requiresApproval: false,
  },
  {
    name: "Social mention (Reddit / Discord)",
    when: "Source is reddit or discord",
    then: "Summarise the context in the ticket title. Tag `social`. Set priority to normal. Draft a friendly, community-appropriate reply.",
    requiresApproval: true,
  },
  {
    name: "Low app review (≤2 stars) → urgent ticket",
    when: "Source is app_reviews and rating tag is 1 or 2 stars",
    then: "Create an urgent ticket. Flag for immediate follow-up response.",
    requiresApproval: false,
  },
  {
    name: "No reply after 48 hours",
    when: "A ticket has been open with no outbound message for 48 hours",
    then: "Flag ticket as awaiting-customer. Draft a gentle follow-up check-in message for approval.",
    requiresApproval: true,
  },
];

export async function seedDefaultWorkflowRules(clientId: string): Promise<void> {
  await prisma.supportWorkflowRule.createMany({
    data: DEFAULT_WORKFLOW_RULES.map((r) => ({
      clientId,
      name: r.name,
      triggerText: r.when,
      actionsText: r.then,
      requiresApproval: r.requiresApproval,
    })),
    skipDuplicates: true,
  });
}

export async function updateWorkflowRule(
  ruleId: string,
  data: Partial<{
    name: string;
    when: string;
    then: string;
    requiresApproval: boolean;
  }>,
): Promise<WorkflowRule> {
  const row = await prisma.supportWorkflowRule.update({
    where: { id: ruleId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.when !== undefined ? { triggerText: data.when } : {}),
      ...(data.then !== undefined ? { actionsText: data.then } : {}),
      ...(data.requiresApproval !== undefined
        ? { requiresApproval: data.requiresApproval }
        : {}),
    },
  });
  return serializeWorkflowRule(row);
}

export async function deleteWorkflowRule(ruleId: string): Promise<void> {
  await prisma.supportWorkflowRule.delete({ where: { id: ruleId } });
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export async function listAuditLogs(clientId: string): Promise<AuditLog[]> {
  const rows = await prisma.supportAuditLog.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(serializeAuditLog);
}

export async function createAuditLog(
  clientId: string,
  data: {
    actor?: string;
    action: string;
    target?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<AuditLog> {
  const row = await prisma.supportAuditLog.create({
    data: {
      clientId,
      actorId: data.actor ?? null,
      action: data.action,
      target: data.target ?? null,
      metadata: data.metadata ? (data.metadata as import("@prisma/client").Prisma.InputJsonValue) : undefined,
    },
  });
  return serializeAuditLog(row);
}

// ─── Monthly Reports ──────────────────────────────────────────────────────────

function serializeReport(row: {
  id: string;
  clientId: string;
  period: string;
  payload: import("@prisma/client").Prisma.JsonValue;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SupportReport {
  return {
    id: row.id,
    clientId: row.clientId,
    period: row.period,
    payload: (row.payload ?? {}) as unknown as SupportReportPayload,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listReports(clientId: string): Promise<SupportReport[]> {
  const rows = await prisma.supportReport.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeReport);
}

export async function createReport(
  clientId: string,
  data: { period: string; payload: SupportReportPayload; createdBy?: string },
): Promise<SupportReport> {
  const row = await prisma.supportReport.create({
    data: {
      clientId,
      period: data.period,
      payload: data.payload as unknown as import("@prisma/client").Prisma.InputJsonValue,
      createdBy: data.createdBy ?? null,
    },
  });
  return serializeReport(row);
}

export async function updateReport(
  reportId: string,
  data: { period?: string; payload?: SupportReportPayload },
): Promise<SupportReport> {
  const row = await prisma.supportReport.update({
    where: { id: reportId },
    data: {
      ...(data.period !== undefined ? { period: data.period } : {}),
      ...(data.payload !== undefined
        ? { payload: data.payload as unknown as import("@prisma/client").Prisma.InputJsonValue }
        : {}),
    },
  });
  return serializeReport(row);
}

export async function deleteReport(reportId: string): Promise<void> {
  await prisma.supportReport.delete({ where: { id: reportId } });
}

export async function getReport(reportId: string): Promise<SupportReport | null> {
  const row = await prisma.supportReport.findUnique({ where: { id: reportId } });
  if (!row) return null;
  return serializeReport(row);
}

// ─── Workspace Members ────────────────────────────────────────────────────────

export async function listWorkspaceMembers(): Promise<
  { id: string; name: string; email: string; role: string }[]
> {
  const workspaceId = await getWorkspaceId();
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: true },
  });
  return rows.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
    role: m.role,
  }));
}

// ─── Workflow rule evaluation ─────────────────────────────────────────────────
//
// Simple keyword/sentiment evaluator: each rule's triggerText is parsed for
// quoted phrases and sentiment keywords. If the conversation matches, a ticket
// is auto-created (requiresApproval:false) or a draft action queued (true).
// Called non-blockingly after a new conversation is ingested.

const SENTIMENT_KEYWORDS = ["negative", "upset", "angry", "frustrated", "escalate"];

function extractTriggerKeywords(triggerText: string): string[] {
  // Pull out "quoted" phrases and bare words that look like match criteria
  const quoted = [...triggerText.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
  // Also grab any standalone notable words not in stop-list
  const words = triggerText.toLowerCase().replace(/"[^"]*"/g, "").match(/\b[a-z]{4,}\b/g) ?? [];
  const stopWords = new Set(["when", "message", "contains", "with", "that", "have", "been", "from", "this", "will", "they", "their", "there", "about", "after"]);
  const bare = words.filter((w) => !stopWords.has(w));
  return [...new Set([...quoted, ...bare])];
}

function conversationMatchesRule(
  rule: { triggerText: string },
  conv: { subject: string; preview: string | null; tags: string[]; sentiment: string; source: string },
): boolean {
  const text = `${conv.subject} ${conv.preview ?? ""}`.toLowerCase();
  const trigger = rule.triggerText.toLowerCase();
  const keywords = extractTriggerKeywords(rule.triggerText);

  // Sentiment-based rules
  if (SENTIMENT_KEYWORDS.some((k) => trigger.includes(k))) {
    if (conv.sentiment === "NEGATIVE") return true;
  }

  // Source-based rules: "source is reddit", "source is discord", "source is app_reviews"
  const sourceRuleMatch = trigger.match(/source is ([\w_]+)/);
  if (sourceRuleMatch) {
    if (conv.source.toUpperCase() === sourceRuleMatch[1].toUpperCase()) return true;
  }

  // Rating-based rules: "rating tag is 1 or 2 stars", "≤2 stars"
  if (trigger.includes("rating") && (trigger.includes("≤") || trigger.includes("1 or 2") || trigger.includes("star"))) {
    if (conv.tags.some((t) => t === "rating:1" || t === "rating:2")) return true;
  }

  // Triage tag-based rules: "triage tags the conversation as bug", "triage tags ... as billing"
  if (trigger.includes("triage tag")) {
    const issueMatch = trigger.match(/\bas\s+(?:a\s+)?([\w_]+)/);
    if (issueMatch && conv.tags.includes(issueMatch[1])) return true;
  }

  // Keyword match — any trigger keyword found in conversation text
  return keywords.some((kw) => text.includes(kw));
}

export async function evaluateWorkflowRules(
  clientId: string,
  convId: string,
): Promise<void> {
  const [conv, rules] = await Promise.all([
    prisma.supportConversation.findUnique({
      where: { id: convId },
      select: { subject: true, preview: true, tags: true, sentiment: true, source: true, customerLabel: true },
    }),
    prisma.supportWorkflowRule.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!conv || rules.length === 0) return;

  for (const rule of rules) {
    if (!conversationMatchesRule(rule, conv)) continue;

    // Don't fire the same rule twice for the same conversation (check existing tickets)
    const alreadyFired = await prisma.supportTicket.findFirst({
      where: { clientId, conversationId: convId, issueType: rule.name },
      select: { id: true },
    });
    if (alreadyFired) continue;

    const title = `${rule.name} — ${conv.subject.slice(0, 80)}`;

    if (!rule.requiresApproval) {
      await prisma.supportTicket.create({
        data: {
          clientId,
          conversationId: convId,
          title,
          customerLabel: conv.customerLabel,
          source: conv.source,
          issueType: rule.name,
          priority: rule.name.toLowerCase().includes("bug") ? "HIGH" : "NORMAL",
          status: "OPEN",
        },
      });
    } else {
      // Queue as a draft action for human review
      const existingTicket = await prisma.supportTicket.findFirst({
        where: { clientId, conversationId: convId },
        select: { id: true },
      });
      if (existingTicket) {
        await prisma.draftSupportAction.create({
          data: {
            clientId,
            ticketId: existingTicket.id,
            type: "REPLY",
            title: `Rule fired: ${rule.name}`,
            body: rule.actionsText,
            status: "PENDING_APPROVAL",
            risk: "MEDIUM",
          },
        });
      }
    }

    // Only fire the first matching rule per sync (avoid cascade of auto-tickets)
    break;
  }
}
