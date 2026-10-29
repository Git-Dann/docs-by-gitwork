/**
 * Two businesses for the isolation suite.
 *
 * A uses the Gitwork slug, because today's code serves that workspace to everyone; B is a
 * second business ("Canary"). Every row's text carries a marker — `ISO-A-…` or `ISO-B-…` —
 * so a response that contains the OTHER business's marker is a leak, whatever the route
 * returns and however it shapes it.
 *
 * Ids are fixed and readable (`iso-a-task`), so a route path can be filled from them and a
 * failure names the row it touched. Rows are created directly with Prisma: running
 * `runFirstBootSetup` would seed Gitwork's real content and take minutes.
 */
import type { PrismaClient, Prisma } from "@prisma/client";

export type Side = "a" | "b";
export const OTHER: Record<Side, Side> = { a: "b", b: "a" };
export const MARK = (side: Side) => `ISO-${side.toUpperCase()}-`;
const m = (side: Side, what: string) => `${MARK(side)}${what}`;
const id = (side: Side, what: string) => `iso-${side}-${what}`;

/** The ids a route path can be filled with, keyed by what they name. */
export type SideIds = {
  workspace: string;
  user: string;
  member: string;
  clientSlug: string;
  client: string;
  task: string;
  taskComment: string;
  featureBlock: string;
  milestone: string;
  document: string;
  documentToken: string;
  scan: string;
  scanShareToken: string;
  monitor: string;
  supportClient: string;
  conversation: string;
  ticket: string;
  wiki: string;
  wikiToken: string;
  sheet: string;
  sheetRow: string;
  intakeItem: string;
  wikiMonitor: string;
  wikiDocument: string;
  changelog: string;
  platform: string;
  meeting: string;
  candidate: string;
  placement: string;
  rateCardPerson: string;
  leave: string;
  expense: string;
  absence: string;
  handbook: string;
  snippet: string;
  study: string;
  countermark: string;
  countermarkToken: string;
  onboardingToken: string;
  onboarding: string;
  reminder: string;
  message: string;
  notification: string;
  leadAction: string;
  invite: string;
  proof: string;
  template: string;
};

export function idsFor(side: Side): SideIds {
  return {
    workspace: id(side, "ws"),
    user: id(side, "user"),
    member: id(side, "member"),
    clientSlug: `iso-${side}-client`,
    client: id(side, "client"),
    task: id(side, "task"),
    taskComment: id(side, "task-comment"),
    featureBlock: id(side, "block"),
    milestone: id(side, "milestone"),
    document: id(side, "doc"),
    documentToken: id(side, "doc-token"),
    scan: id(side, "scan"),
    scanShareToken: id(side, "scan-token"),
    monitor: id(side, "monitor"),
    supportClient: id(side, "support"),
    conversation: id(side, "conv"),
    ticket: id(side, "ticket"),
    wiki: id(side, "wiki"),
    wikiToken: id(side, "wiki-token"),
    sheet: id(side, "sheet"),
    sheetRow: id(side, "sheet-row"),
    intakeItem: id(side, "intake"),
    wikiMonitor: id(side, "wiki-monitor"),
    wikiDocument: id(side, "wiki-doc"),
    changelog: id(side, "changelog"),
    platform: id(side, "platform"),
    meeting: id(side, "meeting"),
    candidate: id(side, "candidate"),
    placement: id(side, "placement"),
    rateCardPerson: id(side, "rate"),
    leave: id(side, "leave"),
    expense: id(side, "expense"),
    absence: id(side, "absence"),
    handbook: id(side, "handbook"),
    snippet: id(side, "snippet"),
    study: id(side, "study"),
    countermark: id(side, "countermark"),
    countermarkToken: id(side, "countermark-token"),
    onboardingToken: id(side, "onboarding-token"),
    onboarding: id(side, "onboarding"),
    reminder: id(side, "reminder"),
    message: id(side, "message"),
    notification: id(side, "notification"),
    leadAction: id(side, "lead-action"),
    invite: id(side, "invite"),
    proof: id(side, "proof"),
    template: id(side, "template"),
  };
}

export const IDS: Record<Side, SideIds> = { a: idsFor("a"), b: idsFor("b") };

/** The attacker's identity: a Super Admin of their own business, so nothing is refused on role. */
export function identity(side: Side) {
  return { id: IDS[side].user, email: `iso-${side}@iso-${side}.test`, role: "SUPER_ADMIN", workspaceId: IDS[side].workspace };
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function seedSide(db: PrismaClient, side: Side) {
  const i = IDS[side];
  const slug = side === "a" ? "gitwork" : "iso-canary";
  const now = new Date();

  await db.workspace.create({ data: { id: i.workspace, name: m(side, "workspace"), slug } });
  await db.user.create({ data: { id: i.user, email: identity(side).email, name: m(side, "user") } });
  await db.workspaceMember.create({ data: { id: i.member, workspaceId: i.workspace, userId: i.user, role: "SUPER_ADMIN" } });

  await db.workspaceClient.create({
    data: {
      id: i.client,
      workspaceId: i.workspace,
      name: m(side, "client"),
      slug: i.clientSlug,
      notes: m(side, "client-notes"),
      timelineShareToken: id(side, "timeline-token"),
      timelineShareEnabled: true,
    },
  });
  await db.featureBlock.create({ data: { id: i.featureBlock, workspaceId: i.workspace, clientId: i.client, name: m(side, "block") } });
  await db.milestone.create({ data: { id: i.milestone, workspaceId: i.workspace, clientId: i.client, name: m(side, "milestone"), date: now } });
  await db.task.create({
    data: { id: i.task, workspaceId: i.workspace, clientId: i.client, title: m(side, "task"), description: m(side, "task-description"), featureBlockId: i.featureBlock },
  });
  await db.taskComment.create({ data: { id: i.taskComment, taskId: i.task, body: m(side, "task-comment") } });

  await db.document.create({
    data: {
      id: i.document,
      workspaceId: i.workspace,
      ownerId: i.user,
      title: m(side, "document"),
      clientId: i.client,
      shareToken: i.documentToken,
      isShared: true,
      sections: { create: [{ key: "prose", title: m(side, "section"), sortOrder: 0, data: json({ body: m(side, "section-body") }) }] },
    },
  });

  await db.pulseScan.create({
    data: {
      id: i.scan,
      workspaceId: i.workspace,
      projectName: m(side, "scan"),
      inputType: "URL",
      inputUrl: `https://iso-${side}.test`,
      status: "COMPLETED",
      clientId: i.client,
      scanVersion: "iso",
      shareToken: i.scanShareToken,
      isShared: true,
      checks: { create: [{ category: "SECURITY", checkKey: "ssl_valid", label: m(side, "check"), status: "FAIL", sortOrder: 0, detail: m(side, "check-detail") }] },
    },
  });
  await db.pulseMonitor.create({ data: { id: i.monitor, workspaceId: i.workspace, projectName: m(side, "monitor"), inputType: "URL", inputUrl: `https://iso-${side}.test`, clientId: i.client } });

  await db.supportClient.create({ data: { id: i.supportClient, workspaceId: i.workspace, name: m(side, "support-client"), slug: `iso-${side}-support`, workspaceClientId: i.client } });
  await db.supportConversation.create({
    data: {
      id: i.conversation,
      clientId: i.supportClient,
      source: "GMAIL",
      customerLabel: m(side, "customer"),
      subject: m(side, "conversation"),
      receivedAt: now,
      messages: { create: [{ direction: "inbound", authorLabel: m(side, "author"), body: m(side, "message-body") }] },
    },
  });
  await db.supportTicket.create({ data: { id: i.ticket, clientId: i.supportClient, title: m(side, "ticket"), customerLabel: m(side, "ticket-customer"), source: "GMAIL" } });
  await db.supportAuditLog.create({ data: { clientId: i.supportClient, action: m(side, "support-audit") } });

  await db.clientWiki.create({
    data: {
      id: i.wiki,
      clientId: i.client,
      shareToken: i.wikiToken,
      shareEnabled: true,
      intakeEnabled: true,
      monitorsEnabled: true,
      documentsEnabled: true,
      sheetsEnabled: true,
    },
  });
  await db.wikiSheet.create({
    data: {
      id: i.sheet,
      wikiId: i.wiki,
      title: m(side, "sheet"),
      columns: json([{ id: "c1", title: m(side, "column"), type: "text" }]),
      rows: { create: [{ id: i.sheetRow, cells: json({ c1: m(side, "cell") }) }] },
    },
  });
  await db.clientWikiIntakeItem.create({ data: { id: i.intakeItem, wikiId: i.wiki, title: m(side, "request"), description: m(side, "request-body") } });
  await db.wikiMonitor.create({ data: { id: i.wikiMonitor, wikiId: i.wiki, name: m(side, "uptime"), target: `https://iso-${side}.test` } });
  await db.wikiDocument.create({ data: { id: i.wikiDocument, wikiId: i.wiki, title: m(side, "wiki-document") } });
  await db.clientChangelogEntry.create({ data: { id: i.changelog, wikiId: i.wiki, platform: "WEB", version: "1.0.0", title: m(side, "changelog") } });
  await db.clientPlatform.create({ data: { id: i.platform, clientId: i.client, name: m(side, "platform") } });

  await db.meeting.create({
    data: { id: i.meeting, workspaceId: i.workspace, clientId: i.client, title: m(side, "meeting"), summary: m(side, "meeting-summary"), actionItems: { create: [{ text: m(side, "action-item") }] } },
  });

  await db.candidate.create({ data: { id: i.candidate, workspaceId: i.workspace, name: m(side, "candidate"), primaryStack: "TypeScript", email: `cand@iso-${side}.test` } });
  await db.placement.create({ data: { id: i.placement, candidateId: i.candidate, clientName: m(side, "placement-client"), projectName: m(side, "placement"), startDate: now } });
  await db.rateCardPerson.create({ data: { id: i.rateCardPerson, workspaceId: i.workspace, name: m(side, "rate-person"), area: "Engineering", sourceRate: 500, sourceCurrencyCode: "GBP" } });

  await db.leaveRequest.create({ data: { id: i.leave, workspaceId: i.workspace, userId: i.user, type: "ANNUAL", startDate: now, endDate: now, reason: m(side, "leave") } });
  await db.expense.create({ data: { id: i.expense, workspaceId: i.workspace, userId: i.user, amount: 12, category: "Travel", occurredOn: now, notes: m(side, "expense") } });
  await db.absence.create({ data: { id: i.absence, workspaceId: i.workspace, userId: i.user, date: now, kind: "SICK", coverTaskIds: [], note: m(side, "absence") } });

  await db.handbookArticle.create({ data: { id: i.handbook, workspaceId: i.workspace, title: m(side, "handbook"), slug: `iso-${side}-handbook`, content: m(side, "handbook-body") } });
  await db.contentSnippet.create({ data: { id: i.snippet, workspaceId: i.workspace, name: m(side, "snippet"), sectionKey: "prose", data: json({ body: m(side, "snippet-body") }) } });
  await db.study.create({ data: { id: i.study, workspaceId: i.workspace, title: m(side, "study"), problemStatement: m(side, "study-problem") } });
  await db.clientOnboarding.create({ data: { id: i.onboarding, workspaceId: i.workspace, accessToken: i.onboardingToken, companyName: m(side, "onboarding") } });
  await db.deskReminder.create({ data: { id: i.reminder, workspaceId: i.workspace, userId: i.user, body: m(side, "reminder") } });
  await db.teamMessage.create({ data: { id: i.message, workspaceId: i.workspace, authorId: i.user, subject: m(side, "team-message"), body: m(side, "team-message-body") } });
  await db.notification.create({ data: { id: i.notification, workspaceId: i.workspace, userId: i.user, event: "iso", title: m(side, "notification"), groupKey: `iso-${side}` } });
  await db.leadAction.create({ data: { id: i.leadAction, workspaceId: i.workspace, clientId: i.client, title: m(side, "lead-action") } });
  await db.workspaceInvite.create({ data: { id: i.invite, workspaceId: i.workspace, invitedById: i.user, label: m(side, "invite") } });
  await db.auditLog.create({ data: { workspaceId: i.workspace, action: m(side, "audit") } });
  await db.documentTemplate.create({
    data: { id: i.template, workspaceId: i.workspace, name: m(side, "template"), slug: `iso-${side}-template`, sections: json([]) },
  });
}

/** Everything a write could change, read back as one string. A difference means a route wrote. */
export async function snapshotSide(db: PrismaClient, side: Side): Promise<string> {
  const i = IDS[side];
  const ws = { workspaceId: i.workspace };
  const parts = await Promise.all([
    db.workspace.findUnique({ where: { id: i.workspace } }),
    db.workspaceMember.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.workspaceClient.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.task.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.taskComment.findMany({ where: { taskId: i.task }, orderBy: { id: "asc" } }),
    db.featureBlock.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.milestone.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.document.findMany({ where: ws, orderBy: { id: "asc" }, include: { sections: { orderBy: { id: "asc" } } } }),
    db.pulseScan.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.pulseMonitor.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.supportClient.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.supportConversation.findMany({ where: { clientId: i.supportClient }, orderBy: { id: "asc" } }),
    db.supportTicket.findMany({ where: { clientId: i.supportClient }, orderBy: { id: "asc" } }),
    db.clientWiki.findMany({ where: { clientId: i.client } }),
    db.wikiSheet.findMany({ where: { wikiId: i.wiki }, orderBy: { id: "asc" }, include: { rows: { orderBy: { id: "asc" } } } }),
    db.clientWikiIntakeItem.findMany({ where: { wikiId: i.wiki }, orderBy: { id: "asc" } }),
    db.wikiMonitor.findMany({ where: { wikiId: i.wiki }, orderBy: { id: "asc" } }),
    db.wikiDocument.findMany({ where: { wikiId: i.wiki }, orderBy: { id: "asc" } }),
    db.clientChangelogEntry.findMany({ where: { wikiId: i.wiki }, orderBy: { id: "asc" } }),
    db.clientPlatform.findMany({ where: { clientId: i.client }, orderBy: { id: "asc" } }),
    db.meeting.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.candidate.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.placement.findMany({ where: { candidateId: i.candidate }, orderBy: { id: "asc" } }),
    db.rateCardPerson.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.leaveRequest.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.expense.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.absence.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.handbookArticle.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.contentSnippet.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.study.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.clientOnboarding.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.deskReminder.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.teamMessage.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.leadAction.findMany({ where: ws, orderBy: { id: "asc" } }),
    db.workspaceInvite.findMany({ where: ws, orderBy: { id: "asc" } }),
  ]);
  return JSON.stringify(parts, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/** Empty every table, so a reseed starts from nothing. */
export async function truncateAll(db: PrismaClient) {
  const rows = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length === 0) return;
  await db.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
}

export async function seedBoth(db: PrismaClient) {
  await truncateAll(db);
  await seedSide(db, "a");
  await seedSide(db, "b");
}
