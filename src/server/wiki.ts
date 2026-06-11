/**
 * wiki.ts — Client Knowledge Wiki server module
 *
 * Handles the per-client wiki: app-store listing pages, changelog entries,
 * IA guide, developer API guide. Public read is token-gated (same pattern as
 * design-system `shareToken`).
 */

import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  WikiPageType,
  WikiPlatform,
  WikiEntryStatus,
  CourseRequestStatus,
} from "@prisma/client";

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

export interface WikiDTO {
  id: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
  shareToken: string | null;
  shareEnabled: boolean;
  /** Active changelog platforms. Defaults to ["IOS","ANDROID","WEB"] when unset. */
  platforms: string[];
  /** Per-page public share tokens, keyed by section (ia / dev-guide / changelog / course-requests). */
  pageShares: Record<string, string>;
  pages: WikiPageRecord[];
  changelog: ChangelogEntryRecord[];
  courseRequests: CourseRequestRecord[];
  updatedAt: string;
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

async function buildDTO(wiki: {
  id: string;
  clientId: string;
  shareToken: string | null;
  shareEnabled: boolean;
  platforms: unknown;
  pageShares?: unknown;
  updatedAt: Date;
  client: { name: string; slug: string };
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
}): Promise<WikiDTO> {
  return {
    id: wiki.id,
    clientId: wiki.clientId,
    clientName: wiki.client.name,
    clientSlug: wiki.client.slug,
    shareToken: wiki.shareToken,
    shareEnabled: wiki.shareEnabled,
    platforms: Array.isArray(wiki.platforms) ? (wiki.platforms as string[]) : DEFAULT_PLATFORMS,
    pageShares:
      wiki.pageShares && typeof wiki.pageShares === "object"
        ? (wiki.pageShares as Record<string, string>)
        : {},
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
    updatedAt: wiki.updatedAt.toISOString(),
  };
}

const WIKI_INCLUDE = {
  client: { select: { name: true, slug: true } },
  pages: true,
  changelog: true,
  courseRequests: true,
  // platforms is a scalar Json field — included automatically via `include` on
  // the parent model, not via a relation. Listed here as a reminder.
} as const;

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
  if (existing) return buildDTO(existing);

  const wiki = await prisma.clientWiki.create({
    data: { clientId },
    include: WIKI_INCLUDE,
  });
  return buildDTO(wiki);
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
    select: { id: true },
  });

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

  return serializePage(page);
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
      data: { shareEnabled: enabled, ...(needsToken ? { shareToken: token } : {}) },
      select: { shareToken: true, shareEnabled: true },
    });
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

/** Sections that can be individually shared (Design System has its own share). */
const SHAREABLE_SECTIONS = ["ia", "dev-guide", "changelog", "course-requests"] as const;

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
