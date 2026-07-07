import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { expandQuery, deriveKeywords } from "@/server/handbook-search";

// ── Handbook (internal developer knowledgebase) ──────────────────────────────────
// A global, workspace-level, searchable library of developer standards, playbooks and process —
// the canonical "how Gitwork builds". Super-Admin-only for now (role-gated in effective-user.ts /
// use-permissions.ts / middleware). Articles are free-form markdown, grouped by a lightweight
// string `category`. Mirrors the Starter catalog shape, minus the per-scan adoption bits.

export type HandbookStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

// Suggested categories — surfaced in the form's picker. Not enforced: `category` is a free string,
// so the Handbook can grow new sections without a schema change. The library rail lists whatever
// categories are actually in use.
export const HANDBOOK_CATEGORY_SUGGESTIONS: readonly string[] = [
  "Getting Started",
  "Standards",
  "Process",
  "Release & Deploys",
  "Frontend",
  "Backend",
  "Security",
  "Git & Workflow",
  "Design System",
  "Playbooks",
];

// ── Serialization ─────────────────────────────────────────────────────────────

export interface HandbookAuthor {
  id: string;
  name: string | null;
}

export interface HandbookListItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  tags: string[];
  status: HandbookStatus;
  featured: boolean;
  readMinutes: number | null;
  updatedAt: string;
  createdAt: string;
  author: HandbookAuthor | null;
}

export interface HandbookRecord extends HandbookListItem {
  content: string;
  keywords: string[];
  viewCount: number;
  publishedAt: string | null;
}

type HandbookRow = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  content: string;
  tags: string[];
  keywords: string[];
  status: HandbookStatus;
  featured: boolean;
  readMinutes: number | null;
  viewCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null } | null;
};

const AUTHOR_SELECT = { select: { id: true, name: true } } as const;

function serializeListItem(a: HandbookRow): HandbookListItem {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    summary: a.summary,
    category: a.category,
    tags: a.tags,
    status: a.status,
    featured: a.featured,
    readMinutes: a.readMinutes,
    updatedAt: a.updatedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    author: a.author ? { id: a.author.id, name: a.author.name } : null,
  };
}

function serializeArticle(a: HandbookRow): HandbookRecord {
  return {
    ...serializeListItem(a),
    content: a.content,
    keywords: a.keywords,
    viewCount: a.viewCount,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getWorkspace() {
  const { workspace } = await ensureBaseRecords();
  return workspace;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "article"
  );
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 1;
  for (;;) {
    const existing = await prisma.handbookArticle.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

/** ~200 words/minute reading estimate, floored at 1 minute for any non-empty body. */
function estimateReadMinutes(content: string): number | null {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return null;
  return Math.max(1, Math.round(words / 200));
}

function normalizeCategory(category?: string | null): string {
  const trimmed = (category ?? "").trim();
  return trimmed.length > 0 ? trimmed : "General";
}

// ── CRUD ────────────────────────────────────────────────────────────────────────

export async function listHandbookArticles(filters?: {
  q?: string;
  category?: string;
  includeArchived?: boolean;
  includeDrafts?: boolean;
}): Promise<HandbookListItem[]> {
  const workspace = await getWorkspace();
  const q = filters?.q?.trim();
  // Smart search: expand the query into related terms (concept map) and match the raw phrase across
  // the text fields plus any expanded term against the hidden `keywords` / visible `tags` arrays. So
  // "ship" surfaces the deploy article, "auth" the security baseline, etc. — not just literal hits.
  const terms = q ? expandQuery(q) : [];
  const searchOr = q
    ? [
        { title: { contains: q, mode: "insensitive" as const } },
        { summary: { contains: q, mode: "insensitive" as const } },
        { content: { contains: q, mode: "insensitive" as const } },
        { category: { contains: q, mode: "insensitive" as const } },
        ...terms.map((t) => ({ title: { contains: t, mode: "insensitive" as const } })),
        ...terms.map((t) => ({ summary: { contains: t, mode: "insensitive" as const } })),
        { keywords: { hasSome: terms.length ? terms : [q] } },
        { tags: { hasSome: terms.length ? terms : [q] } },
      ]
    : undefined;

  const rows = await prisma.handbookArticle.findMany({
    where: {
      workspaceId: workspace.id,
      ...(filters?.category ? { category: filters.category } : {}),
      ...(filters?.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
      ...(filters?.includeDrafts === false ? { status: "PUBLISHED" } : {}),
      ...(searchOr ? { OR: searchOr } : {}),
    },
    orderBy: [{ featured: "desc" }, { orderKey: "asc" }, { updatedAt: "desc" }],
    include: { author: AUTHOR_SELECT },
  });
  return rows.map(serializeListItem);
}

export async function getHandbookArticle(id: string): Promise<HandbookRecord | null> {
  const workspace = await getWorkspace();
  const row = await prisma.handbookArticle.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { author: AUTHOR_SELECT },
  });
  return row ? serializeArticle(row) : null;
}

export async function getHandbookArticleBySlug(slug: string): Promise<HandbookRecord | null> {
  const workspace = await getWorkspace();
  const row = await prisma.handbookArticle.findFirst({
    where: { slug, workspaceId: workspace.id },
    include: { author: AUTHOR_SELECT },
  });
  return row ? serializeArticle(row) : null;
}

export async function createHandbookArticle(data: {
  title: string;
  summary?: string | null;
  category?: string | null;
  content?: string | null;
  tags?: string[];
  keywords?: string[];
  status?: HandbookStatus;
  authorId?: string | null;
}): Promise<HandbookRecord> {
  const workspace = await getWorkspace();
  const slug = await uniqueSlug(data.title);
  const content = data.content ?? "";
  const status = data.status ?? "PUBLISHED";
  const tags = data.tags ?? [];
  const category = normalizeCategory(data.category);
  const row = await prisma.handbookArticle.create({
    data: {
      workspaceId: workspace.id,
      authorId: data.authorId ?? null,
      title: data.title,
      slug,
      summary: (data.summary ?? "").trim(),
      category,
      content,
      tags,
      keywords: deriveKeywords({ title: data.title, category, tags, explicit: data.keywords }),
      status,
      readMinutes: estimateReadMinutes(content),
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    },
    include: { author: AUTHOR_SELECT },
  });
  return serializeArticle(row);
}

export async function updateHandbookArticle(
  id: string,
  data: {
    title?: string;
    summary?: string | null;
    category?: string | null;
    content?: string | null;
    tags?: string[];
    keywords?: string[];
    status?: HandbookStatus;
    featured?: boolean;
    authorId?: string | null;
  },
): Promise<HandbookRecord | null> {
  const workspace = await getWorkspace();
  const existing = await prisma.handbookArticle.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true, status: true, publishedAt: true, title: true, category: true, tags: true },
  });
  if (!existing) return null;

  // Stamp publishedAt the first time an article goes live.
  const goingLive = data.status === "PUBLISHED" && existing.status !== "PUBLISHED";

  // Recompute hidden search keywords whenever any input to them changes, from the merged values.
  const keywordsChanged =
    data.title !== undefined || data.category !== undefined || data.tags !== undefined || data.keywords !== undefined;
  const nextKeywords = keywordsChanged
    ? deriveKeywords({
        title: data.title ?? existing.title,
        category: normalizeCategory(data.category ?? existing.category),
        tags: data.tags ?? existing.tags,
        explicit: data.keywords,
      })
    : undefined;

  const row = await prisma.handbookArticle.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.summary !== undefined && { summary: (data.summary ?? "").trim() }),
      ...(data.category !== undefined && { category: normalizeCategory(data.category) }),
      ...(data.content !== undefined && {
        content: data.content ?? "",
        readMinutes: estimateReadMinutes(data.content ?? ""),
      }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(nextKeywords !== undefined && { keywords: nextKeywords }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.featured !== undefined && { featured: data.featured }),
      ...(data.authorId !== undefined && { authorId: data.authorId }),
      ...(goingLive && existing.publishedAt === null ? { publishedAt: new Date() } : {}),
    },
    include: { author: AUTHOR_SELECT },
  });
  return serializeArticle(row);
}

export async function deleteHandbookArticle(id: string): Promise<boolean> {
  const workspace = await getWorkspace();
  const existing = await prisma.handbookArticle.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.handbookArticle.delete({ where: { id } });
  return true;
}

/** Best-effort read counter — never blocks or throws into the read path. */
export async function recordHandbookView(id: string): Promise<void> {
  const workspace = await getWorkspace();
  try {
    await prisma.handbookArticle.updateMany({
      where: { id, workspaceId: workspace.id },
      data: { viewCount: { increment: 1 } },
    });
  } catch {
    /* view counting is non-critical */
  }
}

/** Distinct categories in use (for the library rail), each with its article count. */
export async function listHandbookCategories(): Promise<{ category: string; count: number }[]> {
  const workspace = await getWorkspace();
  const grouped = await prisma.handbookArticle.groupBy({
    by: ["category"],
    where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
    _count: { _all: true },
    orderBy: { category: "asc" },
  });
  return grouped.map((g: { category: string; _count: { _all: number } }) => ({
    category: g.category,
    count: g._count._all,
  }));
}
