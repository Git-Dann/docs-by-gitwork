import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { listStarters, type StarterListItem } from "@/server/starters";

// ── Starter Recipes ──────────────────────────────────────────────────────────────
// A named, curated bundle of existing Starters ("give me the whole stack for X kind of
// project" in one click). Pure grouping layer over the Starters catalog — no new content,
// just an ordered list of Starter ids. Mirrors Starter's global-built-in-vs-workspace-authored
// shape (nullable workspaceId) and slug convention.

export interface StarterRecipeRecord {
  id: string;
  name: string;
  slug: string;
  summary: string;
  description: string | null;
  starterIds: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A recipe with its member Starters resolved (stale/deleted ids silently dropped). */
export interface StarterRecipeWithStarters extends StarterRecipeRecord {
  starters: StarterListItem[];
}

type StarterRecipeRow = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  description: string | null;
  starterIds: string[];
  isDefault: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function serializeRecipe(r: StarterRecipeRow): StarterRecipeRecord {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    summary: r.summary,
    description: r.description,
    starterIds: r.starterIds,
    isDefault: r.isDefault,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function getWorkspace() {
  const { workspace } = await ensureBaseRecords();
  return workspace;
}

/** Built-ins have a null workspaceId; workspace-authored recipes carry the workspace id. */
function scopeWhere(workspaceId: string): Prisma.StarterRecipeWhereInput {
  return { OR: [{ workspaceId }, { workspaceId: null }] };
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "recipe"
  );
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 1;
  for (;;) {
    const existing = await prisma.starterRecipe.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listRecipes(opts?: { includeArchived?: boolean }): Promise<StarterRecipeRecord[]> {
  const workspace = await getWorkspace();
  const rows = await prisma.starterRecipe.findMany({
    where: { ...scopeWhere(workspace.id), ...(opts?.includeArchived ? {} : { isArchived: false }) },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(serializeRecipe);
}

/** Recipes with their member Starters resolved — the shape the UI actually renders. Batches
 *  one Starter fetch across every recipe rather than N+1-ing per card. */
export async function listRecipesWithStarters(): Promise<StarterRecipeWithStarters[]> {
  const [recipes, allStarters] = await Promise.all([listRecipes(), listStarters()]);
  const byId = new Map(allStarters.map((s) => [s.id, s]));
  return recipes.map((r) => ({
    ...r,
    starters: r.starterIds.map((id) => byId.get(id)).filter((s): s is StarterListItem => Boolean(s)),
  }));
}

export async function getRecipe(id: string): Promise<StarterRecipeWithStarters | null> {
  const workspace = await getWorkspace();
  const row = await prisma.starterRecipe.findFirst({ where: { id, ...scopeWhere(workspace.id) } });
  if (!row) return null;
  const allStarters = await listStarters();
  const byId = new Map(allStarters.map((s) => [s.id, s]));
  const recipe = serializeRecipe(row);
  return { ...recipe, starters: recipe.starterIds.map((sid) => byId.get(sid)).filter((s): s is StarterListItem => Boolean(s)) };
}

export async function getRecipeBySlug(slug: string): Promise<StarterRecipeWithStarters | null> {
  const workspace = await getWorkspace();
  const row = await prisma.starterRecipe.findFirst({ where: { slug, ...scopeWhere(workspace.id) } });
  if (!row) return null;
  const allStarters = await listStarters();
  const byId = new Map(allStarters.map((s) => [s.id, s]));
  const recipe = serializeRecipe(row);
  return { ...recipe, starters: recipe.starterIds.map((sid) => byId.get(sid)).filter((s): s is StarterListItem => Boolean(s)) };
}

export async function createRecipe(data: {
  name: string;
  summary: string;
  description?: string | null;
  starterIds?: string[];
}): Promise<StarterRecipeRecord> {
  const workspace = await getWorkspace();
  const slug = await uniqueSlug(data.name);
  const row = await prisma.starterRecipe.create({
    data: {
      workspaceId: workspace.id,
      name: data.name,
      slug,
      summary: data.summary,
      description: data.description ?? null,
      starterIds: data.starterIds ?? [],
    },
  });
  return serializeRecipe(row);
}

export async function updateRecipe(
  id: string,
  data: {
    name?: string;
    summary?: string;
    description?: string | null;
    starterIds?: string[];
    isArchived?: boolean;
  },
): Promise<StarterRecipeRecord | null> {
  const workspace = await getWorkspace();
  const existing = await prisma.starterRecipe.findFirst({ where: { id, ...scopeWhere(workspace.id) } });
  if (!existing) return null;
  const row = await prisma.starterRecipe.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.summary !== undefined && { summary: data.summary }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.starterIds !== undefined && { starterIds: data.starterIds }),
      ...(data.isArchived !== undefined && { isArchived: data.isArchived }),
    },
  });
  return serializeRecipe(row);
}

export async function deleteRecipe(id: string): Promise<boolean> {
  const workspace = await getWorkspace();
  const existing = await prisma.starterRecipe.findFirst({ where: { id, ...scopeWhere(workspace.id) } });
  if (!existing) return false;
  await prisma.starterRecipe.delete({ where: { id } });
  return true;
}
