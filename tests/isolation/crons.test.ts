/**
 * Scheduled jobs against a real database with two businesses: each runs for its own workspace,
 * with its own keys and accounts, and never reaches into the other's data.
 *
 * The mocked versions are in src/server/__tests__/crons-per-workspace.test.ts; this proves the
 * real queries scope the way the mocks assume.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { IDS, seedBoth } from "./fixtures";

process.env.CRON_SECRET = "isolation-cron-secret";
// Without a Google client configured every account resolves to null, which would pass the backup
// test whether or not it is scoped. Fake values: nothing is called (the network is off).
process.env.GOOGLE_CLIENT_ID = "isolation-google-client";
process.env.GOOGLE_CLIENT_SECRET = "isolation-google-secret";
const cronRequest = (path: string) =>
  new Request(`http://localhost${path}`, { headers: { authorization: "Bearer isolation-cron-secret" } }) as never;

beforeAll(async () => {
  await seedBoth(prisma);
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("scheduled jobs stay inside their own workspace", () => {
  it("docs backup never borrows another business's Google account", async () => {
    // A (Gitwork) has a connected Google account; B switched backup on but connected nothing.
    await prisma.user.update({ where: { id: IDS.a.user }, data: { googleOAuthRefreshToken: "a-refresh-token" } });
    await prisma.workspace.update({ where: { id: IDS.b.workspace }, data: { docsBackupEnabled: true } });

    const { resolveBackupAuth } = await import("@/server/google-drive-backup");
    // A's own account is found (so a null for B below means "scoped", not "nothing resolves")…
    expect(await resolveBackupAuth({ id: IDS.a.workspace, docsBackupEnabled: true })).not.toBeNull();
    // …and B, with no account of its own, gets none rather than A's.
    expect(await resolveBackupAuth({ id: IDS.b.workspace, docsBackupEnabled: true })).toBeNull();

    const { GET } = await import("@/app/api/cron/docs-gdrive-backup/route");
    const body = await (await GET(cronRequest("/api/cron/docs-gdrive-backup"))).json();
    expect(body).toEqual({ reason: "no_connected_backup_account", processed: 0 });
  });
});
