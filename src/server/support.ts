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
} from "@/types/support";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
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
  };
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
}): Connection {
  return {
    id: row.id,
    clientId: row.clientId,
    source: mapSource(row.source),
    label: row.label,
    authMode: mapAuthMode(row.authMode),
    health: mapHealth(row.health),
    secretRef: row.secretRef ?? undefined,
    nextStep: row.nextStep ?? undefined,
    scraperConfig: row.scraperConfig
      ? (row.scraperConfig as Connection["scraperConfig"])
      : undefined,
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
  });
  return rows.map(serializeSupportClient);
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
    },
  });
  return serializeSupportClient(row);
}

export async function deleteSupportClient(clientId: string): Promise<void> {
  await prisma.supportClient.delete({ where: { id: clientId } });
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function listConversations(clientId: string): Promise<Conversation[]> {
  const rows = await prisma.supportConversation.findMany({
    where: { clientId },
    include: { tickets: { select: { id: true }, take: 1 } },
    orderBy: { receivedAt: "desc" },
  });
  return rows.map(serializeConversation);
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
  return serializeMessage(row);
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export async function listTickets(clientId: string): Promise<Ticket[]> {
  const rows = await prisma.supportTicket.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serializeTicket);
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
  }>,
): Promise<Ticket> {
  const row = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.customerLabel !== undefined ? { customerLabel: data.customerLabel } : {}),
      ...(data.status !== undefined ? { status: toDbTicketStatus(data.status) } : {}),
      ...(data.priority !== undefined ? { priority: toDbTicketPriority(data.priority) } : {}),
      ...(data.source !== undefined ? { source: toDbSource(data.source) } : {}),
      ...(data.nextAction !== undefined ? { nextAction: data.nextAction } : {}),
      ...(data.issueType !== undefined ? { issueType: data.issueType } : {}),
      ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo } : {}),
    },
  });
  return serializeTicket(row);
}

export async function deleteTicket(ticketId: string): Promise<void> {
  await prisma.supportTicket.delete({ where: { id: ticketId } });
}

// ─── Connections ──────────────────────────────────────────────────────────────

export async function listConnections(clientId: string): Promise<Connection[]> {
  const rows = await prisma.accountConnection.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
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
      scraperConfig: data.scraperConfig ? (data.scraperConfig as object) : undefined,
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
        ? { scraperConfig: data.scraperConfig as object }
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
