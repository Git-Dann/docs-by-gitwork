/**
 * Terminal fallback for the admin "Demo Data Cleanup" button in
 * Settings → Developer. Same denylist, same effect — just runs from your
 * shell instead of the browser.
 *
 *   npx tsx scripts/prune-non-gitwork-devs.ts            # dry run
 *   npx tsx scripts/prune-non-gitwork-devs.ts --apply    # actually delete
 *
 * Required env: DATABASE_URL (Neon pooled URL).
 *
 * Source of truth for what gets deleted: src/server/demo-cleanup.ts.
 */

import { PrismaClient } from "@prisma/client";
import {
  DEMO_CANDIDATE_NAMES,
  DEMO_CANDIDATE_HANDLES,
  LEGACY_RATE_CARD_SEED_IDS,
} from "../src/server/demo-cleanup";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  if (!apply) {
    console.log("Dry run — no writes will happen. Re-run with --apply to delete.\n");
  } else {
    console.log("APPLY MODE — deletions will be committed.\n");
  }

  // Run unscoped (across all workspaces) since the script doesn't know which
  // workspace to target. The denylist is narrow enough that this is safe.
  const candidatesToRemove = await prisma.candidate.findMany({
    where: {
      OR: [
        { name: { in: DEMO_CANDIDATE_NAMES } },
        { githubHandle: { in: DEMO_CANDIDATE_HANDLES } },
      ],
    },
    select: { id: true, name: true, githubHandle: true },
  });

  console.log(`Candidates to remove: ${candidatesToRemove.length}`);
  for (const candidate of candidatesToRemove) {
    console.log(`  - ${candidate.name} (@${candidate.githubHandle})`);
  }

  const peopleToRemove = await prisma.rateCardPerson.findMany({
    where: { seedIdentifier: { in: LEGACY_RATE_CARD_SEED_IDS } },
    select: { id: true, name: true, seedIdentifier: true },
  });

  console.log(`\nRateCardPeople to remove: ${peopleToRemove.length}`);
  for (const person of peopleToRemove) {
    console.log(`  - ${person.name} (${person.seedIdentifier})`);
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to delete the rows listed above.");
    return;
  }

  if (candidatesToRemove.length > 0) {
    await prisma.candidate.deleteMany({
      where: { id: { in: candidatesToRemove.map((c) => c.id) } },
    });
    console.log(`\nDeleted ${candidatesToRemove.length} candidates.`);
  }

  if (peopleToRemove.length > 0) {
    await prisma.rateCardPerson.deleteMany({
      where: { id: { in: peopleToRemove.map((p) => p.id) } },
    });
    console.log(`Deleted ${peopleToRemove.length} rate-card people.`);
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
