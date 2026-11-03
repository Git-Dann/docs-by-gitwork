import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugifyClientName } from "@/lib/clients";
import { getDefaultOnboardingForm } from "@/lib/onboarding/default-form";
import { isFormStructure } from "@/lib/onboarding/structure";
import type {
  OnboardingFormRecord,
  OnboardingFormStructure,
  OnboardingFormSummary,
} from "@/types/onboarding";

const formInclude = { _count: { select: { onboardings: true } } } satisfies Prisma.OnboardingFormInclude;
type FormRow = Prisma.OnboardingFormGetPayload<{ include: typeof formInclude }>;

/** Guard a JSON `steps` blob into a structure, falling back to the default. */
function normalizeStructure(value: Prisma.JsonValue | null): OnboardingFormStructure {
  return isFormStructure(value) ? (value as unknown as OnboardingFormStructure) : getDefaultOnboardingForm();
}

function toRecord(row: FormRow): OnboardingFormRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    structure: normalizeStructure(row.steps),
    isDefault: row.isDefault,
    isArchived: row.isArchived,
    linkCount: row._count.onboardings,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(row: FormRow): OnboardingFormSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isDefault: row.isDefault,
    isArchived: row.isArchived,
    linkCount: row._count.onboardings,
    stepCount: normalizeStructure(row.steps).steps.length,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A workspace-unique slug derived from the form name. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugifyClientName(name) || "onboarding-form";
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const exists = await prisma.onboardingForm.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) break;
    slug = `${base}-${i}`;
  }
  return slug;
}

/** A workspace sees its own rows plus Foundry's stock ones (`workspaceId` null). */
const visibleTo = (workspaceId: string) => ({ OR: [{ workspaceId }, { workspaceId: null }] });

export async function listOnboardingForms(workspaceId: string, options?: {
  includeArchived?: boolean;
}): Promise<{ forms: OnboardingFormSummary[] }> {
  const workspace = { id: workspaceId };
  const rows = await prisma.onboardingForm.findMany({
    where: {
      OR: [{ workspaceId: workspace.id }, { workspaceId: null }],
      ...(options?.includeArchived ? {} : { isArchived: false }),
    },
    include: formInclude,
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return { forms: rows.map(toSummary) };
}

export async function getOnboardingForm(workspaceId: string, id: string): Promise<OnboardingFormRecord | null> {
  const row = await prisma.onboardingForm.findFirst({ where: { id, ...visibleTo(workspaceId) }, include: formInclude });
  return row ? toRecord(row) : null;
}

export async function createOnboardingForm(workspaceId: string, input: {
  name: string;
  description?: string;
  structure?: OnboardingFormStructure;
  cloneFromId?: string;
}): Promise<OnboardingFormRecord> {
  const workspace = { id: workspaceId };

  // Seed structure priority: explicit structure → clone source → the default form.
  let structure = input.structure;
  if (!structure && input.cloneFromId) {
    const source = await prisma.onboardingForm.findFirst({
      where: { id: input.cloneFromId, ...visibleTo(workspaceId) },
      select: { steps: true },
    });
    if (source) structure = normalizeStructure(source.steps);
  }
  if (!structure) structure = getDefaultOnboardingForm();

  const slug = await uniqueSlug(input.name);
  const row = await prisma.onboardingForm.create({
    data: {
      workspaceId: workspace.id,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      steps: structure as unknown as Prisma.InputJsonValue,
      isDefault: false,
    },
    include: formInclude,
  });
  return toRecord(row);
}

export async function duplicateOnboardingForm(workspaceId: string, id: string): Promise<OnboardingFormRecord | null> {
  const source = await prisma.onboardingForm.findFirst({ where: { id, ...visibleTo(workspaceId) } });
  if (!source) return null;
  return createOnboardingForm(workspaceId, {
    name: `${source.name} (copy)`,
    description: source.description ?? undefined,
    structure: normalizeStructure(source.steps),
  });
}

export async function updateOnboardingForm(workspaceId: string, 
  id: string,
  input: {
    name?: string;
    description?: string | null;
    structure?: OnboardingFormStructure;
    isDefault?: boolean;
    isArchived?: boolean;
  },
): Promise<OnboardingFormRecord | null> {
  const existing = await prisma.onboardingForm.findFirst({ where: { id, ...visibleTo(workspaceId) }, select: { id: true } });
  if (!existing) return null;

  const data: Prisma.OnboardingFormUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.structure !== undefined) data.steps = input.structure as unknown as Prisma.InputJsonValue;
  if (input.isArchived !== undefined) data.isArchived = input.isArchived;

  // Promote to default: clear the flag on every other form first (only one default).
  if (input.isDefault === true) {
    await prisma.onboardingForm.updateMany({
      where: { isDefault: true, NOT: { id }, ...visibleTo(workspaceId) },
      data: { isDefault: false },
    });
    data.isDefault = true;
    data.isArchived = false; // a default form can't be archived
  } else if (input.isDefault === false) {
    data.isDefault = false;
  }

  const row = await prisma.onboardingForm.update({ where: { id }, data, include: formInclude });
  return toRecord(row);
}

export async function deleteOnboardingForm(workspaceId: string, 
  id: string,
): Promise<{ deleted: boolean; archived?: boolean } | null> {
  const row = await prisma.onboardingForm.findFirst({
    where: { id, ...visibleTo(workspaceId) },
    include: formInclude,
  });
  if (!row) return null;
  if (row.isDefault) {
    throw new Error("Can't delete the default form. Make another form the default first.");
  }
  // Keep forms that have minted links — links snapshot their structure, but the
  // formId FK + audit trail point here. Archive instead of hard-deleting.
  if (row._count.onboardings > 0) {
    await prisma.onboardingForm.update({ where: { id }, data: { isArchived: true } });
    return { deleted: false, archived: true };
  }
  await prisma.onboardingForm.delete({ where: { id } });
  return { deleted: true };
}
