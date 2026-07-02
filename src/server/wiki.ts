/**
 * wiki.ts — Client Knowledge Wiki server module
 *
 * Handles the per-client wiki: documentation pages, app-store listing pages,
 * changelog entries, and course requests. Public read is token-gated (same pattern as
 * design-system `shareToken`).
 */

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  WikiPageType,
  WikiPlatform,
  WikiEntryStatus,
  CourseRequestStatus,
} from "@prisma/client";
import type { DesignTokens } from "@/types/design-tokens";
import { loadWikiMonitors, type WikiMonitorsSection } from "./wiki-monitors";

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface WikiPageRecord {
  id: string;
  type: WikiPageType;
  title: string;
  content: unknown;
  sortOrder: number;
  updatedAt: string;
}

export interface ChangelogEntryRecord {
  id: string;
  platform: string; // WikiPlatform
  version: string;
  title: string;
  body: string | null;
  releasedAt: string | null;
  createdAt: string;
  /** "PENDING" | "APPROVED" */
  status: string;
}

export interface CourseRequestRecord {
  id: string;
  courseName: string;
  country: string | null;
  /** "NEW" | "SENT" | "ADDED" | "REJECTED" */
  status: string;
  notes: string | null;
  sourceConversationId: string | null;
  /** ISO timestamp when status was last set to SENT; null for pre-existing rows. */
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A feature block rendered as a Gantt bar on the wiki Timeline page. */
export interface WikiTimelineBlock {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  color: string | null;
  progress: number;
  tasks: { title: string; done: boolean }[];
}

export interface WikiTimelineMilestone {
  id: string;
  name: string;
  date: string;
  color: string | null;
}

export interface WikiTimeline {
  blocks: WikiTimelineBlock[];
  milestones: WikiTimelineMilestone[];
}

/** The client's design system, surfaced inside the wiki when it exists. */
export interface WikiDesignSystem {
  tokens: DesignTokens;
  logoUrl: string | null;
}

export interface WikiDTO {
  id: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
  /** The client's website (from the Portal record), shown in the dashboard hero. */
  website: string | null;
  /** Primary contact pulled from the Portal record (null when none set). */
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  shareToken: string | null;
  shareEnabled: boolean;
  /** Active changelog platforms. Defaults to ["IOS","ANDROID","WEB"] when unset. */
  platforms: string[];
  /** Per-page public share tokens, keyed by section (ia / dev-guide / api-docs / changelog etc.). */
  pageShares: Record<string, string>;
  /** Private sidebar sections the operator manually removed. */
  hiddenSections: string[];
  pages: WikiPageRecord[];
  changelog: ChangelogEntryRecord[];
  courseRequests: CourseRequestRecord[];
  /** Project delivery timeline (feature blocks + milestones) — same source as /timeline/[token]. */
  timeline: WikiTimeline;
  /** The client's design system tokens, when one exists (null otherwise). */
  designSystem: WikiDesignSystem | null;
  /** Uptime monitors section — whether it's enabled + the monitors with stats. */
  monitors: WikiMonitorsSection;
  /**
   * Client login accounts for the public link (email + name; password never
   * exposed). Populated only for the internal editor — the public payload omits
   * these so client emails never leave the server.
   */
  users: WikiUserSummary[];
  updatedAt: string;
}

/** A client wiki login account, safe for the client (no password hash). */
export interface WikiUserSummary {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializePage(p: {
  id: string;
  type: WikiPageType;
  title: string;
  content: unknown;
  sortOrder: number;
  updatedAt: Date;
}): WikiPageRecord {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    content: p.content,
    sortOrder: p.sortOrder,
    updatedAt: p.updatedAt.toISOString(),
  };
}

function serializeEntry(e: {
  id: string;
  platform: WikiPlatform;
  version: string;
  title: string;
  body: string | null;
  releasedAt: Date | null;
  createdAt: Date;
  status: WikiEntryStatus;
}): ChangelogEntryRecord {
  return {
    id: e.id,
    platform: e.platform,
    version: e.version,
    title: e.title,
    body: e.body,
    releasedAt: e.releasedAt ? e.releasedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
    status: e.status,
  };
}

function serializeCourseRequest(r: {
  id: string;
  courseName: string;
  country: string | null;
  status: CourseRequestStatus;
  notes: string | null;
  sourceConversationId: string | null;
  sentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CourseRequestRecord {
  return {
    id: r.id,
    courseName: r.courseName,
    country: r.country,
    status: r.status,
    notes: r.notes,
    sourceConversationId: r.sourceConversationId,
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const DEFAULT_PLATFORMS = ["IOS", "ANDROID", "WEB"];

/**
 * Load the client's delivery timeline (feature blocks + milestones) for the wiki
 * Timeline page. Mirrors `getPublicTimeline` in client-timeline.ts so the wiki and
 * the standalone /timeline/[token] share show the same client-facing roadmap:
 * block names + task titles + progress only — no assignees/notes/internal status.
 */
async function loadWikiTimeline(clientId: string): Promise<WikiTimeline> {
  const blocks = await prisma.featureBlock.findMany({
    where: { clientId },
    orderBy: [{ orderKey: "asc" }, { startDate: "asc" }],
    include: {
      tasks: { select: { title: true, status: true, dueDate: true }, orderBy: { orderKey: "asc" } },
    },
  });

  const timelineBlocks: WikiTimelineBlock[] = blocks
    .map((b) => {
      // Sections render once they have a span — explicit dates, or derived from
      // the date range of their tasks' due dates (so undated sections still show).
      const dues = b.tasks
        .map((t) => t.dueDate)
        .filter((d): d is Date => d !== null)
        .map((d) => d.getTime())
        .sort((a, z) => a - z);
      const start = b.startDate ?? (dues.length ? new Date(dues[0]) : null);
      const end = b.endDate ?? (dues.length ? new Date(dues[dues.length - 1]) : null);
      if (!start || !end) return null;
      const taskCount = b.tasks.length;
      const doneCount = b.tasks.filter((t) => t.status === "DONE").length;
      return {
        id: b.id,
        name: b.name,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        color: b.color,
        progress: taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100),
        tasks: b.tasks.map((t) => ({ title: t.title, done: t.status === "DONE" })),
      };
    })
    .filter((b): b is WikiTimelineBlock => b !== null);

  const milestones = await prisma.milestone.findMany({
    where: { clientId },
    orderBy: { date: "asc" },
    select: { id: true, name: true, date: true, color: true },
  });

  return {
    blocks: timelineBlocks,
    milestones: milestones.map((m) => ({
      id: m.id,
      name: m.name,
      date: m.date.toISOString(),
      color: m.color,
    })),
  };
}

/**
 * Load the client's design system for the wiki. The whole-wiki share is the gate
 * (the public page only resolves when shareEnabled), so the DS is included here
 * regardless of its own /brand/ share — "share entire wiki" means the DS too.
 */
async function loadWikiDesignSystem(clientId: string): Promise<WikiDesignSystem | null> {
  const row = await prisma.clientDesignSystem.findUnique({
    where: { clientId },
    include: { client: { select: { logoUrl: true } } },
  });
  if (!row || !row.tokens) return null;
  return {
    tokens: row.tokens as unknown as DesignTokens,
    logoUrl: row.client.logoUrl ?? null,
  };
}

async function buildDTO(
  wiki: {
  id: string;
  clientId: string;
  shareToken: string | null;
  shareEnabled: boolean;
  platforms: unknown;
  pageShares?: unknown;
  hiddenSections?: unknown;
  updatedAt: Date;
  client: {
    name: string;
    slug: string;
    website?: string | null;
    primaryContactName?: string | null;
    primaryContactEmail?: string | null;
    primaryContactPhone?: string | null;
  };
  wikiUsers?: Array<{ id: string; email: string; name: string | null; createdAt: Date }>;
  pages: Array<{
    id: string;
    type: WikiPageType;
    title: string;
    content: unknown;
    sortOrder: number;
    updatedAt: Date;
  }>;
  changelog: Array<{
    id: string;
    platform: WikiPlatform;
    version: string;
    title: string;
    body: string | null;
    releasedAt: Date | null;
    createdAt: Date;
    status: WikiEntryStatus;
  }>;
  courseRequests?: Array<{
    id: string;
    courseName: string;
    country: string | null;
    status: CourseRequestStatus;
    notes: string | null;
    sourceConversationId: string | null;
    sentAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  },
  opts?: { includeUsers?: boolean },
): Promise<WikiDTO> {
  return {
    id: wiki.id,
    clientId: wiki.clientId,
    clientName: wiki.client.name,
    clientSlug: wiki.client.slug,
    website: wiki.client.website ?? null,
    contact:
      wiki.client.primaryContactName ||
      wiki.client.primaryContactEmail ||
      wiki.client.primaryContactPhone
        ? {
            name: wiki.client.primaryContactName ?? null,
            email: wiki.client.primaryContactEmail ?? null,
            phone: wiki.client.primaryContactPhone ?? null,
          }
        : null,
    shareToken: wiki.shareToken,
    shareEnabled: wiki.shareEnabled,
    platforms: Array.isArray(wiki.platforms) ? (wiki.platforms as string[]) : DEFAULT_PLATFORMS,
    pageShares:
      wiki.pageShares && typeof wiki.pageShares === "object"
        ? (wiki.pageShares as Record<string, string>)
        : {},
    hiddenSections: Array.isArray(wiki.hiddenSections)
      ? wiki.hiddenSections.filter((section): section is string => typeof section === "string")
      : [],
    pages: wiki.pages.sort((a, b) => a.sortOrder - b.sortOrder).map(serializePage),
    changelog: wiki.changelog
      .sort((a, b) => {
        // Sort newest first: by releasedAt desc, then createdAt desc
        const ta = (a.releasedAt ?? a.createdAt).getTime();
        const tb = (b.releasedAt ?? b.createdAt).getTime();
        return tb - ta;
      })
      .map(serializeEntry),
    courseRequests: (wiki.courseRequests ?? [])
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(serializeCourseRequest),
    timeline: await loadWikiTimeline(wiki.clientId),
    designSystem: await loadWikiDesignSystem(wiki.clientId),
    monitors: await loadWikiMonitors(wiki.clientId),
    users: opts?.includeUsers
      ? (wiki.wikiUsers ?? [])
          .slice()
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            createdAt: u.createdAt.toISOString(),
          }))
      : [],
    updatedAt: wiki.updatedAt.toISOString(),
  };
}

const WIKI_INCLUDE = {
  client: {
    select: {
      name: true,
      slug: true,
      website: true,
      primaryContactName: true,
      primaryContactEmail: true,
      primaryContactPhone: true,
    },
  },
  pages: true,
  changelog: true,
  courseRequests: true,
  wikiUsers: { select: { id: true, email: true, name: true, createdAt: true } },
  // platforms is a scalar Json field — included automatically via `include` on
  // the parent model, not via a relation. Listed here as a reminder.
} as const;

const PAGE_TYPE_TO_SECTION: Partial<Record<WikiPageType, string>> = {
  IA_GUIDE: "ia",
  DEV_API_GUIDE: "dev-guide",
  API_DOCS: "api-docs",
  ARCHITECTURE: "architecture",
  RUNBOOK: "runbook",
  DATA_MODEL: "data-model",
  SYSTEM_STATUS: "system-status",
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch or auto-create the wiki for a client (by clientId, not slug).
 * Authenticated — no token check.
 */
export async function getOrCreateWiki(clientId: string): Promise<WikiDTO> {
  const existing = await prisma.clientWiki.findUnique({
    where: { clientId },
    include: WIKI_INCLUDE,
  });
  if (existing) return buildDTO(existing, { includeUsers: true });

  const wiki = await prisma.clientWiki.create({
    data: { clientId },
    include: WIKI_INCLUDE,
  });
  return buildDTO(wiki, { includeUsers: true });
}

/** Fetch by slug — resolves clientId via the client record. */
export async function getWikiBySlug(
  slug: string,
  workspaceId: string,
): Promise<WikiDTO | null> {
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: { id: true },
  });
  if (!client) return null;
  return getOrCreateWiki(client.id);
}

/** Upsert a wiki page (one per type per wiki). Auto-creates the wiki if absent. */
export async function upsertWikiPage(
  clientId: string,
  input: { type: WikiPageType; title: string; content?: unknown },
): Promise<WikiPageRecord> {
  // Ensure wiki exists
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true, hiddenSections: true },
  });
  const section = PAGE_TYPE_TO_SECTION[input.type];
  const hiddenSections = Array.isArray(wiki.hiddenSections)
    ? wiki.hiddenSections.filter((item): item is string => typeof item === "string")
    : [];

  const page = await prisma.clientWikiPage.upsert({
    where: { wikiId_type: { wikiId: wiki.id, type: input.type } },
    create: {
      wikiId: wiki.id,
      type: input.type,
      title: input.title,
      content: input.content as Prisma.InputJsonValue | undefined,
    },
    update: {
      title: input.title,
      content: input.content as Prisma.InputJsonValue | undefined,
    },
  });

  if (section && hiddenSections.includes(section)) {
    await prisma.clientWiki.update({
      where: { id: wiki.id },
      data: { hiddenSections: hiddenSections.filter((item) => item !== section) },
    });
  }

  return serializePage(page);
}

/** Delete a markdown wiki page and hide its sidebar entry until it is re-added. */
export async function deleteWikiPage(
  clientId: string,
  input: { type: WikiPageType },
): Promise<{ deleted: boolean; hiddenSections: string[] }> {
  const section = PAGE_TYPE_TO_SECTION[input.type];
  if (!section) throw new Error(`Page type "${input.type}" cannot be deleted from the wiki sidebar.`);

  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true, hiddenSections: true, pageShares: true },
  });

  const deleted = await prisma.clientWikiPage.deleteMany({
    where: { wikiId: wiki.id, type: input.type },
  });
  const hiddenSections = Array.isArray(wiki.hiddenSections)
    ? wiki.hiddenSections.filter((item): item is string => typeof item === "string")
    : [];
  if (!hiddenSections.includes(section)) hiddenSections.push(section);

  const pageShares =
    wiki.pageShares && typeof wiki.pageShares === "object"
      ? { ...(wiki.pageShares as Record<string, string>) }
      : {};
  delete pageShares[section];

  await prisma.clientWiki.update({
    where: { id: wiki.id },
    data: {
      hiddenSections,
      pageShares,
      pageShareTokens: Object.values(pageShares),
    },
  });

  return { deleted: deleted.count > 0, hiddenSections };
}

/** Add a changelog entry. Auto-creates the wiki if absent. */
export async function addChangelogEntry(
  clientId: string,
  input: {
    platform: WikiPlatform;
    version: string;
    title: string;
    body?: string;
    releasedAt?: string;
    status?: WikiEntryStatus;
  },
): Promise<ChangelogEntryRecord> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });

  const entry = await prisma.clientChangelogEntry.create({
    data: {
      wikiId: wiki.id,
      platform: input.platform,
      version: input.version,
      title: input.title,
      body: input.body ?? null,
      releasedAt: input.releasedAt ? new Date(input.releasedAt) : null,
      status: input.status ?? "PENDING",
    },
  });

  return serializeEntry(entry);
}

/** Update the status of a single changelog entry. */
export async function updateChangelogEntryStatus(
  entryId: string,
  status: WikiEntryStatus,
): Promise<ChangelogEntryRecord> {
  const entry = await prisma.clientChangelogEntry.update({
    where: { id: entryId },
    data: { status },
  });
  return serializeEntry(entry);
}

/** Update an existing changelog entry's editable fields (by id). */
export async function updateChangelogEntry(
  entryId: string,
  input: {
    version?: string;
    title?: string;
    body?: string | null;
    releasedAt?: string | null;
    status?: WikiEntryStatus;
  },
): Promise<ChangelogEntryRecord> {
  const entry = await prisma.clientChangelogEntry.update({
    where: { id: entryId },
    data: {
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.releasedAt !== undefined
        ? { releasedAt: input.releasedAt ? new Date(input.releasedAt) : null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  return serializeEntry(entry);
}

/** Delete a changelog entry (by id). */
export async function deleteChangelogEntry(entryId: string): Promise<void> {
  await prisma.clientChangelogEntry.delete({ where: { id: entryId } });
}

// ─── Course requests (Wedge) ────────────────────────────────────────────────

/** Add a course request. Auto-creates the wiki if absent. */
export async function addCourseRequest(
  clientId: string,
  input: {
    courseName: string;
    country?: string | null;
    notes?: string | null;
    status?: CourseRequestStatus;
    sourceConversationId?: string | null;
    source?: string | null;
    externalRef?: string | null;
  },
): Promise<CourseRequestRecord> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });

  const req = await prisma.clientCourseRequest.create({
    data: {
      wikiId: wiki.id,
      courseName: input.courseName,
      country: input.country ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "NEW",
      sourceConversationId: input.sourceConversationId ?? null,
      source: input.source ?? null,
      externalRef: input.externalRef ?? null,
    },
  });
  return serializeCourseRequest(req);
}

/** Update a course request's editable fields (by id). */
export async function updateCourseRequest(
  requestId: string,
  input: {
    courseName?: string;
    country?: string | null;
    notes?: string | null;
    status?: CourseRequestStatus;
  },
): Promise<CourseRequestRecord> {
  const req = await prisma.clientCourseRequest.update({
    where: { id: requestId },
    data: {
      ...(input.courseName !== undefined ? { courseName: input.courseName } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      // Record when a request is first marked as sent to the course provider.
      ...(input.status === "SENT" ? { sentAt: new Date() } : {}),
    },
  });
  return serializeCourseRequest(req);
}

/** Delete a course request (by id). */
export async function deleteCourseRequest(requestId: string): Promise<void> {
  await prisma.clientCourseRequest.delete({ where: { id: requestId } });
}

// ── Inbound course-request API (store-and-forward intake) ────────────────────

/** Current ingest-token state for a client's wiki (token shown so it can be copied). */
export async function getCourseIngest(clientId: string): Promise<{ token: string | null }> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: { courseIngestToken: true },
  });
  return { token: wiki?.courseIngestToken ?? null };
}

/**
 * Enable / disable / rotate the inbound course-request API token.
 * - enabled=true, no token yet (or rotate) → mint a fresh token
 * - enabled=true, token exists, no rotate → keep it
 * - enabled=false → clear it (intake off)
 */
export async function setCourseIngest(
  clientId: string,
  opts: { enabled: boolean; rotate?: boolean },
): Promise<{ token: string | null }> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true, courseIngestToken: true },
  });

  let token: string | null = wiki.courseIngestToken;
  if (!opts.enabled) token = null;
  else if (!token || opts.rotate) token = randomBytes(24).toString("base64url");

  await prisma.clientWiki.update({
    where: { id: wiki.id },
    data: { courseIngestToken: token },
  });
  return { token };
}

export interface CourseIngestItem {
  courseName: string;
  country?: string | null;
  notes?: string | null;
  requestedBy?: string | null;
  externalRef?: string | null;
}

export interface CourseIngestResult {
  created: CourseRequestRecord[];
  skipped: number;
  count: number;
}

/**
 * Token-authenticated intake. Resolves the wiki by its ingest token and creates
 * a course request per item. Idempotent / de-duped:
 * - skip if an item's externalRef already exists on this wiki
 * - else skip if a non-rejected request with the same (case-insensitive) course
 *   name already exists (avoids the same course piling up)
 */
export async function ingestCourseRequestsByToken(
  token: string,
  items: CourseIngestItem[],
): Promise<CourseIngestResult | null> {
  if (!token) return null;
  const wiki = await prisma.clientWiki.findUnique({
    where: { courseIngestToken: token },
    select: {
      clientId: true,
      courseRequests: { select: { courseName: true, externalRef: true, status: true } },
    },
  });
  if (!wiki) return null;

  const seenRefs = new Set(
    wiki.courseRequests.map((r) => r.externalRef).filter((x): x is string => !!x),
  );
  // Existing non-rejected course names, normalized, for name-based dedupe.
  const seenNames = new Set(
    wiki.courseRequests
      .filter((r) => r.status !== "REJECTED")
      .map((r) => r.courseName.trim().toLowerCase())
      .filter(Boolean),
  );

  const created: CourseRequestRecord[] = [];
  let skipped = 0;
  for (const item of items) {
    const name = (item.courseName ?? "").trim();
    if (!name) {
      skipped++;
      continue;
    }
    const ref = item.externalRef?.trim() || null;
    const nameKey = name.toLowerCase();
    if ((ref && seenRefs.has(ref)) || seenNames.has(nameKey)) {
      skipped++;
      continue;
    }

    const reqBy = item.requestedBy?.trim();
    const extra = item.notes?.trim();
    const notes =
      `Via API${reqBy ? ` — requested by ${reqBy}` : ""}` + (extra ? `:\n${extra}` : "");

    created.push(
      await addCourseRequest(wiki.clientId, {
        courseName: name,
        country: item.country?.trim() || null,
        notes,
        status: "NEW",
        source: "api",
        externalRef: ref,
      }),
    );
    if (ref) seenRefs.add(ref);
    seenNames.add(nameKey);
  }

  return { created, skipped, count: created.length };
}

/** Toggle public sharing. Mints a share token on first enable. */
export async function setWikiShare(
  clientId: string,
  enabled: boolean,
): Promise<{ shareToken: string | null; shareEnabled: boolean }> {
  // Ensure wiki row exists
  const existing = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: { id: true, shareToken: true },
  });

  const id = existing?.id;
  const needsToken = enabled && !existing?.shareToken;
  const token = needsToken ? randomBytes(18).toString("base64url") : existing?.shareToken ?? null;

  if (id) {
    const updated = await prisma.clientWiki.update({
      where: { id },
      data: {
        shareEnabled: enabled,
        ...(needsToken ? { shareToken: token } : {}),
        // Disabling the whole-wiki share is the master kill-switch: also revoke
        // every per-page share so the wiki goes fully private (Dan, June 2026).
        ...(enabled ? {} : { pageShares: {}, pageShareTokens: [] }),
      },
      select: { shareToken: true, shareEnabled: true },
    });
    // Master kill-switch also takes the design-system's own /brand/ share private
    // (the DS share lives on a sibling model, also keyed by clientId). Token kept
    // so re-enabling reuses the same URL.
    if (!enabled) {
      await prisma.clientDesignSystem.updateMany({
        where: { clientId },
        data: { shareEnabled: false },
      });
    }
    return { shareToken: updated.shareToken, shareEnabled: updated.shareEnabled };
  }

  // Create and enable in one go
  const created = await prisma.clientWiki.create({
    data: {
      clientId,
      shareEnabled: enabled,
      shareToken: enabled ? randomBytes(18).toString("base64url") : null,
    },
    select: { shareToken: true, shareEnabled: true },
  });
  return { shareToken: created.shareToken, shareEnabled: created.shareEnabled };
}

// ─── Client wiki users (public-link login accounts) ─────────────────────────────

/** Thrown when a user op targets an email already present on the wiki. */
export class WikiUserEmailTakenError extends Error {
  status = 409;
  constructor() {
    super("A user with that email already exists for this wiki.");
    this.name = "WikiUserEmailTakenError";
  }
}

function serializeWikiUser(u: {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}): WikiUserSummary {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt.toISOString() };
}

/** Ensure the wiki row exists for a client and return its id. */
async function ensureWikiId(clientId: string): Promise<string> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });
  return wiki.id;
}

export async function listWikiUsers(clientId: string): Promise<WikiUserSummary[]> {
  const wikiId = await ensureWikiId(clientId);
  const users = await prisma.clientWikiUser.findMany({
    where: { wikiId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  return users.map(serializeWikiUser);
}

export async function createWikiUser(
  clientId: string,
  input: { email: string; password: string; name?: string },
): Promise<WikiUserSummary> {
  const wikiId = await ensureWikiId(clientId);
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const user = await prisma.clientWikiUser.create({
      data: {
        wikiId,
        email: input.email.trim().toLowerCase(),
        name: input.name?.trim() || null,
        passwordHash,
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    return serializeWikiUser(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new WikiUserEmailTakenError();
    }
    throw err;
  }
}

export async function updateWikiUser(
  clientId: string,
  userId: string,
  input: { email?: string; password?: string; name?: string },
): Promise<WikiUserSummary | null> {
  const wikiId = await ensureWikiId(clientId);
  // Scope the update to this wiki so one client can't touch another's users.
  const existing = await prisma.clientWikiUser.findFirst({
    where: { id: userId, wikiId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Prisma.ClientWikiUserUpdateInput = {};
  if (input.email !== undefined) data.email = input.email.trim().toLowerCase();
  if (input.name !== undefined) data.name = input.name.trim() || null;
  if (input.password !== undefined && input.password.length > 0) {
    data.passwordHash = await bcrypt.hash(input.password, 12);
  }

  try {
    const user = await prisma.clientWikiUser.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, createdAt: true },
    });
    return serializeWikiUser(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new WikiUserEmailTakenError();
    }
    throw err;
  }
}

export async function deleteWikiUser(clientId: string, userId: string): Promise<boolean> {
  const wikiId = await ensureWikiId(clientId);
  const result = await prisma.clientWikiUser.deleteMany({ where: { id: userId, wikiId } });
  return result.count > 0;
}

/** Sections that can be individually shared (Design System has its own share). */
const SHAREABLE_SECTIONS = [
  "timeline",
  "system-status",
  "monitors",
  "design-system",
  "ia",
  "dev-guide",
  "api-docs",
  "architecture",
  "runbook",
  "data-model",
  "changelog",
  "course-requests",
] as const;

/**
 * Toggle a per-page (per-section) public share. Mints a token for the section
 * on first enable; removes it on disable. Returns the section→token map.
 */
export async function setWikiSectionShare(
  clientId: string,
  section: string,
  enabled: boolean,
): Promise<Record<string, string>> {
  if (!SHAREABLE_SECTIONS.includes(section as (typeof SHAREABLE_SECTIONS)[number])) {
    throw new Error(`Section "${section}" is not shareable`);
  }
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true, pageShares: true },
  });

  const map: Record<string, string> =
    wiki.pageShares && typeof wiki.pageShares === "object"
      ? { ...(wiki.pageShares as Record<string, string>) }
      : {};

  if (enabled) {
    if (!map[section]) map[section] = randomBytes(18).toString("base64url");
  } else {
    delete map[section];
  }

  await prisma.clientWiki.update({
    where: { id: wiki.id },
    data: { pageShares: map, pageShareTokens: Object.values(map) },
  });
  return map;
}

/**
 * Public read — requires `shareEnabled: true` and a valid whole-wiki token.
 * Returns null if the token is invalid or sharing is off.
 */
export async function getPublicWiki(token: string): Promise<WikiDTO | null> {
  const wiki = await prisma.clientWiki.findFirst({
    where: { shareToken: token, shareEnabled: true },
    include: WIKI_INCLUDE,
  });
  if (!wiki) return null;
  return buildDTO(wiki);
}

/**
 * Resolve any public wiki token — whole-wiki or a single shared section.
 * Returns the wiki DTO plus `onlySection` (null = whole wiki).
 */
export async function resolvePublicWiki(
  token: string,
): Promise<{ wiki: WikiDTO; onlySection: string | null } | null> {
  // Whole-wiki share takes precedence.
  const whole = await prisma.clientWiki.findFirst({
    where: { shareToken: token, shareEnabled: true },
    include: WIKI_INCLUDE,
  });
  if (whole) return { wiki: await buildDTO(whole), onlySection: null };

  // Otherwise look for a per-section token.
  const bySection = await prisma.clientWiki.findFirst({
    where: { pageShareTokens: { has: token } },
    include: WIKI_INCLUDE,
  });
  if (!bySection) return null;
  const map =
    bySection.pageShares && typeof bySection.pageShares === "object"
      ? (bySection.pageShares as Record<string, string>)
      : {};
  const section = Object.keys(map).find((k) => map[k] === token) ?? null;
  if (!section) return null;
  return { wiki: await buildDTO(bySection), onlySection: section };
}

/**
 * Update the set of enabled changelog platforms for a client's wiki.
 * Auto-creates the wiki row if it doesn't exist.
 */
export async function updateWikiPlatforms(
  clientId: string,
  platforms: string[],
): Promise<WikiDTO> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, platforms },
    update: { platforms },
    include: WIKI_INCLUDE,
  });
  return buildDTO(wiki);
}
