/**
 * launchpad-templates.ts — CRUD for the editable master Launchpad template.
 *
 * A close sibling of `onboarding-forms.ts`, and deliberately so: the same
 * single-default rule and the same archive-instead-of-delete-once-used rule, because
 * both exist for the same reason — a template that has been assigned is referenced
 * by kits that snapshot it, and hard-deleting it destroys the provenance of what a
 * client was actually asked for.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugifyClientName } from "@/lib/clients";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getDefaultLaunchpadStructure } from "@/lib/launchpad/default-template";
import { allFields, isLaunchpadStructure } from "@/lib/launchpad/structure";
import type {
  LaunchpadStructure,
  LaunchpadTemplateRecord,
  LaunchpadTemplateSummary,
} from "@/types/launchpad";

const templateInclude = {
  _count: { select: { launchpads: true } },
} satisfies Prisma.LaunchpadTemplateInclude;

type TemplateRow = Prisma.LaunchpadTemplateGetPayload<{ include: typeof templateInclude }>;

/** Guard a JSON `structure` blob, falling back to the in-code default. */
export function normalizeStructure(value: Prisma.JsonValue | null): LaunchpadStructure {
  return isLaunchpadStructure(value)
    ? (value as unknown as LaunchpadStructure)
    : getDefaultLaunchpadStructure();
}

function toRecord(row: TemplateRow): LaunchpadTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    structure: normalizeStructure(row.structure),
    isDefault: row.isDefault,
    isArchived: row.isArchived,
    kitCount: row._count.launchpads,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(row: TemplateRow): LaunchpadTemplateSummary {
  const structure = normalizeStructure(row.structure);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isDefault: row.isDefault,
    isArchived: row.isArchived,
    kitCount: row._count.launchpads,
    moduleCount: structure.modules.length,
    itemCount: allFields(structure).filter((f) => f.type === "checklist_item").length,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A workspace-unique slug derived from the template name. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugifyClientName(name) || "launchpad-template";
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const exists = await prisma.launchpadTemplate.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) break;
    slug = `${base}-${i}`;
  }
  return slug;
}

export async function listLaunchpadTemplates(options?: {
  includeArchived?: boolean;
}): Promise<{ templates: LaunchpadTemplateSummary[] }> {
  const { workspace } = await ensureBaseRecords();
  const rows = await prisma.launchpadTemplate.findMany({
    where: {
      OR: [{ workspaceId: workspace.id }, { workspaceId: null }],
      ...(options?.includeArchived ? {} : { isArchived: false }),
    },
    include: templateInclude,
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return { templates: rows.map(toSummary) };
}

export async function getLaunchpadTemplate(id: string): Promise<LaunchpadTemplateRecord | null> {
  const row = await prisma.launchpadTemplate.findUnique({ where: { id }, include: templateInclude });
  return row ? toRecord(row) : null;
}

/** The template a new kit is assigned from: the explicit id if live, else the default. */
export async function resolveAssignableTemplate(
  templateId?: string,
): Promise<{ id: string; structure: Prisma.JsonValue; name: string } | null> {
  if (templateId) {
    const byId = await prisma.launchpadTemplate.findFirst({
      where: { id: templateId, isArchived: false },
      select: { id: true, structure: true, name: true },
    });
    if (byId) return byId;
  }
  return prisma.launchpadTemplate.findFirst({
    where: { isArchived: false, isDefault: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, structure: true, name: true },
  });
}

export async function createLaunchpadTemplate(input: {
  name: string;
  description?: string;
  structure?: LaunchpadStructure;
  cloneFromId?: string;
}): Promise<LaunchpadTemplateRecord> {
  const { workspace } = await ensureBaseRecords();

  // Seed priority: explicit structure → clone source → the default.
  let structure = input.structure;
  if (!structure && input.cloneFromId) {
    const source = await prisma.launchpadTemplate.findUnique({
      where: { id: input.cloneFromId },
      select: { structure: true },
    });
    if (source) structure = normalizeStructure(source.structure);
  }
  if (!structure) structure = getDefaultLaunchpadStructure();

  const slug = await uniqueSlug(input.name);
  const row = await prisma.launchpadTemplate.create({
    data: {
      workspaceId: workspace.id,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      structure: structure as unknown as Prisma.InputJsonValue,
      isDefault: false,
    },
    include: templateInclude,
  });
  return toRecord(row);
}

export async function duplicateLaunchpadTemplate(
  id: string,
): Promise<LaunchpadTemplateRecord | null> {
  const source = await prisma.launchpadTemplate.findUnique({ where: { id } });
  if (!source) return null;
  return createLaunchpadTemplate({
    name: `${source.name} (copy)`,
    description: source.description ?? undefined,
    structure: normalizeStructure(source.structure),
  });
}

export async function updateLaunchpadTemplate(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    structure?: LaunchpadStructure;
    isDefault?: boolean;
    isArchived?: boolean;
  },
): Promise<LaunchpadTemplateRecord | null> {
  const existing = await prisma.launchpadTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Prisma.LaunchpadTemplateUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.structure !== undefined) {
    data.structure = input.structure as unknown as Prisma.InputJsonValue;
  }
  if (input.isArchived !== undefined) data.isArchived = input.isArchived;

  // Promote to default: clear the flag on every other template first (only one default).
  if (input.isDefault === true) {
    await prisma.launchpadTemplate.updateMany({
      where: { isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
    data.isDefault = true;
    data.isArchived = false; // a default template can't be archived
  } else if (input.isDefault === false) {
    data.isDefault = false;
  }

  const row = await prisma.launchpadTemplate.update({
    where: { id },
    data,
    include: templateInclude,
  });
  return toRecord(row);
}

export async function deleteLaunchpadTemplate(
  id: string,
): Promise<{ deleted: boolean; archived?: boolean } | null> {
  const row = await prisma.launchpadTemplate.findUnique({ where: { id }, include: templateInclude });
  if (!row) return null;
  if (row.isDefault) {
    throw new Error("Can't delete the default template. Make another template the default first.");
  }
  // Assigned kits snapshot their structure, but `templateId` and the audit trail
  // point here — archive rather than hard-delete, exactly as onboarding forms do.
  if (row._count.launchpads > 0) {
    await prisma.launchpadTemplate.update({ where: { id }, data: { isArchived: true } });
    return { deleted: false, archived: true };
  }
  await prisma.launchpadTemplate.delete({ where: { id } });
  return { deleted: true };
}
