import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

// ── Starters (Prompt→Production library) ────────────────────────────────────────
// A Gitwork-branded catalog of reusable building blocks, surfaced as an admin-only tool inside
// Pulse. Mirrors the DocumentTemplate / OnboardingForm catalog shape. Every entry is presented
// under the Gitwork name only — internal provenance lives in content._buildRef and is stripped
// by serializeStarter so it never reaches any client payload.

export type StarterType = "PROMPT" | "SKILL" | "PLUGIN" | "KIT" | "COLLECTION";
export type StarterStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * Flexible per-starter payload. `_buildRef` is INTERNAL provenance (what we're building on top
 * of) and is deliberately stripped before serialization — it must never surface in the UI.
 */
export interface StarterContent {
  whatYouGet?: string[];
  install?: string[];
  techStack?: string[];
  promptText?: string;
  /** Public "view & use" reference — the upstream this starter is built from. */
  sourceLabel?: string;
  /** Public link to the source (direct repo, or a GitHub search when the exact repo isn't pinned). */
  sourceUrl?: string;
  /** Internal only — never serialized to any client surface. */
  _buildRef?: string;
  [key: string]: unknown;
}

// ── Serialization ───────────────────────────────────────────────────────────────

export interface StarterListItem {
  id: string;
  name: string;
  slug: string;
  summary: string;
  type: StarterType;
  status: StarterStatus;
  tags: string[];
  featured: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StarterRecord extends StarterListItem {
  description: string | null;
  content: StarterContent | null;
}

type StarterRow = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  description: string | null;
  type: StarterType;
  status: StarterStatus;
  tags: string[];
  content: unknown;
  featured: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function serializeListItem(s: StarterRow): StarterListItem {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    summary: s.summary,
    type: s.type,
    status: s.status,
    tags: s.tags,
    featured: s.featured,
    isDefault: s.isDefault,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Strip the internal `_buildRef` provenance so it never leaves the server. */
function publicContent(content: unknown): StarterContent | null {
  if (!content || typeof content !== "object") return null;
  const { _buildRef, ...rest } = content as StarterContent;
  void _buildRef;
  return rest as StarterContent;
}

function serializeStarter(s: StarterRow): StarterRecord {
  return {
    ...serializeListItem(s),
    description: s.description,
    content: publicContent(s.content),
  };
}

// ── Workspace helper ──────────────────────────────────────────────────────────

async function getWorkspace() {
  const { workspace } = await ensureBaseRecords();
  return workspace;
}

/** Built-ins have a null workspaceId; workspace-authored starters carry the workspace id. */
function scopeWhere(workspaceId: string): Prisma.StarterWhereInput {
  return { OR: [{ workspaceId }, { workspaceId: null }] };
}

// ── Slug helpers ────────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "starter"
  );
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 1;
  // slug is globally unique; bump a numeric suffix until free.
  for (;;) {
    const existing = await prisma.starter.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listStarters(filters?: {
  type?: StarterType;
  includeArchived?: boolean;
}): Promise<StarterListItem[]> {
  const workspace = await getWorkspace();
  const rows = await prisma.starter.findMany({
    where: {
      ...scopeWhere(workspace.id),
      ...(filters?.type && { type: filters.type }),
      ...(filters?.includeArchived ? {} : { isArchived: false }),
    },
    orderBy: [{ featured: "desc" }, { isDefault: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(serializeListItem);
}

export async function getStarter(id: string): Promise<StarterRecord | null> {
  const workspace = await getWorkspace();
  const row = await prisma.starter.findFirst({ where: { id, ...scopeWhere(workspace.id) } });
  return row ? serializeStarter(row) : null;
}

export async function getStarterBySlug(slug: string): Promise<StarterRecord | null> {
  const workspace = await getWorkspace();
  const row = await prisma.starter.findFirst({ where: { slug, ...scopeWhere(workspace.id) } });
  return row ? serializeStarter(row) : null;
}

export async function createStarter(data: {
  name: string;
  summary: string;
  description?: string | null;
  type: StarterType;
  status?: StarterStatus;
  tags?: string[];
  content?: StarterContent | null;
}): Promise<StarterRecord> {
  const workspace = await getWorkspace();
  const slug = await uniqueSlug(data.name);
  const row = await prisma.starter.create({
    data: {
      workspaceId: workspace.id,
      name: data.name,
      slug,
      summary: data.summary,
      description: data.description ?? null,
      type: data.type,
      status: data.status ?? "PUBLISHED",
      tags: data.tags ?? [],
      content: (data.content ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  return serializeStarter(row);
}

export async function updateStarter(
  id: string,
  data: {
    name?: string;
    summary?: string;
    description?: string | null;
    type?: StarterType;
    status?: StarterStatus;
    tags?: string[];
    content?: StarterContent | null;
    featured?: boolean;
    isArchived?: boolean;
  },
): Promise<StarterRecord | null> {
  const workspace = await getWorkspace();
  const existing = await prisma.starter.findFirst({ where: { id, ...scopeWhere(workspace.id) } });
  if (!existing) return null;
  const row = await prisma.starter.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.summary !== undefined && { summary: data.summary }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.content !== undefined && {
        content: (data.content ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      }),
      ...(data.featured !== undefined && { featured: data.featured }),
      ...(data.isArchived !== undefined && { isArchived: data.isArchived }),
    },
  });
  return serializeStarter(row);
}

export async function deleteStarter(id: string): Promise<boolean> {
  const workspace = await getWorkspace();
  const existing = await prisma.starter.findFirst({ where: { id, ...scopeWhere(workspace.id) } });
  if (!existing) return false;
  await prisma.starter.delete({ where: { id } });
  return true;
}

/**
 * Fork a starter (typically a Gitwork built-in) into this workspace so it can be edited without
 * touching the shipped library entry. The copy keeps provenance, drops isDefault, and gets a
 * fresh unique slug.
 */
export async function duplicateStarter(id: string): Promise<StarterRecord | null> {
  const workspace = await getWorkspace();
  const source = await prisma.starter.findFirst({ where: { id, ...scopeWhere(workspace.id) } });
  if (!source) return null;
  const slug = await uniqueSlug(`${source.name}-copy`);
  const row = await prisma.starter.create({
    data: {
      workspaceId: workspace.id,
      name: `${source.name} (copy)`,
      slug,
      summary: source.summary,
      description: source.description,
      type: source.type,
      status: source.status,
      tags: source.tags,
      content: (source.content ?? undefined) as Prisma.InputJsonValue | undefined,
      isDefault: false,
    },
  });
  return serializeStarter(row);
}

/**
 * Record that a scan adopted a starter. Validates the scan is in this workspace and the starter is
 * reachable (workspace-owned or global built-in), then mirrors the id onto PulseScan.linkedStarterId
 * so the scan-results "Starters" slot flips to "View starter". One side only — a reusable Starter is
 * not back-linked to a single scan.
 */
export async function adoptStarterForScan(
  scanId: string,
  starterId: string,
): Promise<{ scanId: string; starterId: string } | null> {
  const workspace = await getWorkspace();
  const [scan, starter] = await Promise.all([
    prisma.pulseScan.findFirst({ where: { id: scanId, workspaceId: workspace.id }, select: { id: true } }),
    prisma.starter.findFirst({ where: { id: starterId, ...scopeWhere(workspace.id) }, select: { id: true } }),
  ]);
  if (!scan || !starter) return null;
  await prisma.pulseScan.update({ where: { id: scanId }, data: { linkedStarterId: starterId } });
  return { scanId, starterId };
}
