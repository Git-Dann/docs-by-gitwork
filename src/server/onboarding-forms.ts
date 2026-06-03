import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugifyClientName } from "@/lib/clients";
import { ensureBaseRecords } from "@/server/bootstrap";
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

export async function listOnboardingForms(options?: {
  includeArchived?: boolean;
}): Promise<{ forms: OnboardingFormSummary[] }> {
  const { workspace } = await ensureBaseRecords();
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

export async function getOnboardingForm(id: string): Promise<OnboardingFormRecord | null> {
  const row = await prisma.onboardingForm.findUnique({ where: { id }, include: formInclude });
  return row ? toRecord(row) : null;
}

export async function createOnboardingForm(input: {
  name: string;
  description?: string;
  structure?: OnboardingFormStructure;
  cloneFromId?: string;
}): Promise<OnboardingFormRecord> {
  const { workspace } = await ensureBaseRecords();

  // Seed structure priority: explicit structure → clone source → the default form.
  let structure = input.structure;
  if (!structure && input.cloneFromId) {
    const source = await prisma.onboardingForm.findUnique({
      where: { id: input.cloneFromId },
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

export async function duplicateOnboardingForm(id: string): Promise<OnboardingFormRecord | null> {
  const source = await prisma.onboardingForm.findUnique({ where: { id } });
  if (!source) return null;
  return createOnboardingForm({
    name: `${source.name} (copy)`,
    description: source.description ?? undefined,
    structure: normalizeStructure(source.steps),
  });
}

export async function updateOnboardingForm(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    structure?: OnboardingFormStructure;
    isDefault?: boolean;
    isArchived?: boolean;
  },
): Promise<OnboardingFormRecord | null> {
  const existing = await prisma.onboardingForm.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;

  const data: Prisma.OnboardingFormUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.structure !== undefined) data.steps = input.structure as unknown as Prisma.InputJsonValue;
  if (input.isArchived !== undefined) data.isArchived = input.isArchived;

  // Promote to default: clear the flag on every other form first (only one default).
  if (input.isDefault === true) {
    await prisma.onboardingForm.updateMany({
      where: { isDefault: true, NOT: { id } },
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

export async function deleteOnboardingForm(
  id: string,
): Promise<{ deleted: boolean; archived?: boolean } | null> {
  const row = await prisma.onboardingForm.findUnique({
    where: { id },
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
