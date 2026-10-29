/**
 * Suppliers: the companies that supply people to the workspace (docs/hr-platform.md).
 * Gitwork's developers all come through one partner today. Read and written by
 * `hr.manage`; archived, never deleted, because people's records point at them.
 */

import { prisma } from "@/lib/prisma";
import { normaliseSupplier, type SupplierInput, type SupplierRecord } from "@/lib/hr";
import { StaffInputError } from "@/server/staff";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00Z`) : null);

export async function listSuppliers(workspaceId: string, includeArchived = false): Promise<SupplierRecord[]> {
  const [rows, counts] = await Promise.all([
    prisma.supplier.findMany({
      where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { name: "asc" },
    }),
    prisma.candidate.groupBy({
      by: ["supplierId"],
      where: { workspaceId, supplierId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const countBy = new Map(counts.map((c) => [c.supplierId, c._count._all]));
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    companyNumber: s.companyNumber,
    vatNumber: s.vatNumber,
    country: s.country,
    contactName: s.contactName,
    contactEmail: s.contactEmail,
    agreementRenewsOn: day(s.agreementRenewsOn),
    notes: s.notes,
    archived: Boolean(s.archivedAt),
    peopleCount: countBy.get(s.id) ?? 0,
  }));
}

function toData(v: SupplierInput) {
  return {
    ...(v.name !== undefined ? { name: v.name } : {}),
    ...(v.companyNumber !== undefined ? { companyNumber: v.companyNumber } : {}),
    ...(v.vatNumber !== undefined ? { vatNumber: v.vatNumber } : {}),
    ...(v.country !== undefined ? { country: v.country } : {}),
    ...(v.contactName !== undefined ? { contactName: v.contactName } : {}),
    ...(v.contactEmail !== undefined ? { contactEmail: v.contactEmail } : {}),
    ...(v.agreementRenewsOn !== undefined ? { agreementRenewsOn: toDate(v.agreementRenewsOn) } : {}),
    ...(v.notes !== undefined ? { notes: v.notes } : {}),
  };
}

export async function createSupplier(workspaceId: string, input: SupplierInput): Promise<{ id: string }> {
  const v = normaliseSupplier(input, true);
  if (!v.ok) throw new StaffInputError(v.error);
  const created = await prisma.supplier.create({
    data: { workspaceId, name: v.value.name!, ...toData(v.value) },
    select: { id: true },
  });
  return created;
}

export async function updateSupplier(
  workspaceId: string,
  id: string,
  input: SupplierInput & { archived?: boolean },
): Promise<void> {
  const v = normaliseSupplier(input, false);
  if (!v.ok) throw new StaffInputError(v.error);
  const existing = await prisma.supplier.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!existing) throw Object.assign(new Error("Supplier not found"), { status: 404 });
  await prisma.supplier.update({
    where: { id },
    data: {
      ...toData(v.value),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    },
  });
}
