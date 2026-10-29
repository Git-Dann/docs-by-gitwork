/**
 * Scheduled jobs against a real database with two businesses: each runs for its own workspace,
 * with its own keys and accounts, and never reaches into the other's data.
 *
 * The mocked versions are in src/server/__tests__/crons-per-workspace.test.ts; these prove the
 * real queries (including embed-conversations' raw SQL) scope the way the mocks assume.
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

  it("embed-conversations only embeds a workspace's own conversations, with its own key", async () => {
    // The real column is pgvector, added by first-time setup in production; a text column is
    // enough to run the job's own SQL here.
    await prisma.$executeRawUnsafe(`ALTER TABLE "SupportConversation" ADD COLUMN IF NOT EXISTS embedding text`);
    await prisma.workspace.update({ where: { id: IDS.a.workspace }, data: { platformAiKeysAllowed: false, openaiApiKey: null } });
    await prisma.workspace.update({ where: { id: IDS.b.workspace }, data: { platformAiKeysAllowed: false, openaiApiKey: "sk-b-test" } });

    const { GET } = await import("@/app/api/cron/embed-conversations/route");
    const body = (await (await GET(cronRequest("/api/cron/embed-conversations"))).json()) as {
      total: number;
      errors: string[];
      workspaces: { workspaceId: string; ok: boolean; skipped?: boolean }[];
    };

    // Only B has a key, so only B's conversation is attempted (the network is off, so it errors
    // on the call itself). A is skipped rather than embedded with B's key.
    expect(body.total).toBe(1);
    expect(body.errors.every((e) => e.startsWith(`${IDS.b.conversation}:`))).toBe(true);
    expect(body.workspaces).toEqual(
      expect.arrayContaining([
        { workspaceId: IDS.a.workspace, ok: true, skipped: true },
        { workspaceId: IDS.b.workspace, ok: true, skipped: false },
      ]),
    );
  });

  it("support-sync and analytics-snapshot run per workspace and keep their response shape", async () => {
    for (const path of ["/api/cron/support-sync", "/api/cron/analytics-snapshot"]) {
      const mod = await import(`@/app/api/cron/${path.split("/").pop()}/route`);
      const body = await (await mod.GET(cronRequest(path))).json();
      expect(body.workspaces.map((w: { workspaceId: string }) => w.workspaceId).sort()).toEqual(
        [IDS.a.workspace, IDS.b.workspace].sort(),
      );
      expect(body.workspaces.every((w: { ok: boolean }) => w.ok)).toBe(true);
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("errors");
    }
  });
});
