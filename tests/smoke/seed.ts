/**
 * Seed for the browser smoke suite (scripts/smoke.mjs): the isolation suite's two businesses,
 * so every /app page has a workspace, a Super Admin, a client, a task, a document, a Pulse scan,
 * a Care client, a monitor and a staff record to draw. Run by scripts/smoke-db.sh.
 *
 * Refuses any database but `foundry_smoke`, and empties it first.
 */
import { PrismaClient } from "@prisma/client";
import { seedBoth } from "../isolation/fixtures";

async function main() {
  const url = process.env.SMOKE_DATABASE_URL ?? "";
  if (!/\/foundry_smoke(\?|$)/.test(url)) {
    throw new Error("SMOKE_DATABASE_URL must name the foundry_smoke database.");
  }
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await seedBoth(db);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
