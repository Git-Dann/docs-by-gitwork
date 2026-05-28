/**
 * One-shot backfill: assign documentNumber to every existing Document.
 *
 * Strategy:
 *   1. Group existing documents by (workspaceId, documentType, year-of-createdAt).
 *   2. Sort each group by createdAt ascending.
 *   3. Assign `{PREFIX}-{year}-{NNN}` starting at 001 per group.
 *   4. Seed the DocumentCounter table with nextValue = highestAssignedNumber + 1.
 *
 * Idempotent: documents that already have a documentNumber are skipped.
 *
 * Run:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx prisma/backfill-document-numbers.ts
 *
 * Safe to run multiple times.
 */

import { PrismaClient, type DocumentType } from "@prisma/client";

const prisma = new PrismaClient();

const TYPE_PREFIX: Record<DocumentType, string> = {
  PROPOSAL: "PROP",
  SLA: "SLA",
  OTHER: "DOC",
};

async function main() {
  const docs = await prisma.document.findMany({
    where: { documentNumber: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      workspaceId: true,
      documentType: true,
      createdAt: true,
    },
  });

  if (docs.length === 0) {
    console.log("No documents need backfilling.");
    return;
  }

  console.log(`Backfilling ${docs.length} documents…`);

  // Group by (workspaceId, documentType, year)
  type GroupKey = string;
  const groups = new Map<GroupKey, typeof docs>();
  for (const doc of docs) {
    const year = doc.createdAt.getFullYear();
    const key: GroupKey = `${doc.workspaceId}|${doc.documentType}|${year}`;
    const list = groups.get(key) ?? [];
    list.push(doc);
    groups.set(key, list);
  }

  let totalAssigned = 0;

  for (const [key, list] of groups.entries()) {
    const [workspaceId, documentTypeStr, yearStr] = key.split("|");
    const documentType = documentTypeStr as DocumentType;
    const year = parseInt(yearStr, 10);
    const prefix = TYPE_PREFIX[documentType];

    // Find current max counter for this group (in case some docs already have numbers)
    const existing = await prisma.document.findMany({
      where: {
        workspaceId,
        documentType,
        documentNumber: { startsWith: `${prefix}-${year}-` },
      },
      select: { documentNumber: true },
    });
    let counter = existing.reduce((max, d) => {
      const n = parseInt(d.documentNumber?.split("-").pop() ?? "0", 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);

    for (const doc of list) {
      counter += 1;
      const documentNumber = `${prefix}-${year}-${String(counter).padStart(3, "0")}`;
      await prisma.document.update({
        where: { id: doc.id },
        data: { documentNumber },
      });
      console.log(`  ${doc.id} → ${documentNumber}`);
      totalAssigned += 1;
    }

    // Seed/update the DocumentCounter so the next created doc continues from counter+1
    await prisma.documentCounter.upsert({
      where: {
        workspaceId_documentType_year: { workspaceId, documentType, year },
      },
      update: { nextValue: counter + 1 },
      create: { workspaceId, documentType, year, nextValue: counter + 1 },
    });
  }

  console.log(`\nDone. Assigned ${totalAssigned} document numbers across ${groups.size} groups.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
