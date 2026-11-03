/**
 * Scheduled jobs run once per workspace, each with its own settings, and none crosses into
 * another business's data or keys (docs/multi-tenant-roadmap.md, Phase 2). Care's jobs are left
 * out on purpose: Care is not offered to other businesses yet.
 *
 * With one workspace (Gitwork today) every job must behave as it did; with two, each is
 * processed with ITS settings. Prisma is mocked: the database-backed proof lives in
 * tests/isolation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspaces: [] as Array<Record<string, unknown> & { id: string }>,
  userFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        db.workspaces.filter((w) => !where || Object.entries(where).every(([k, v]) => w[k] === v)),
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const ws = db.workspaces.find((w) => w.id === where.id);
        if (!ws) throw new Error("not found");
        return ws;
      }),
    },
    user: { findFirst: db.userFindFirst },
  },
}));

// next-auth's ESM entry can't load in Node; the cron guard only needs its error class.
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

process.env.CRON_SECRET = "cron-test-secret";
const cronRequest = () =>
  new Request("http://localhost/api/cron/x", { headers: { authorization: "Bearer cron-test-secret" } });

beforeEach(() => {
  db.workspaces = [];
  db.userFindFirst.mockReset().mockResolvedValue(null);
});

describe("forEachWorkspace", () => {
  it("runs each matching workspace once, and one failure doesn't stop the others", async () => {
    const { forEachWorkspace } = await import("@/server/workspaces/for-each");
    db.workspaces = [
      { id: "a", docsBackupEnabled: true },
      { id: "b", docsBackupEnabled: false },
      { id: "c", docsBackupEnabled: true },
    ];
    const seen: string[] = [];
    const out = await forEachWorkspace({ where: { docsBackupEnabled: true }, select: { id: true } }, async (ws) => {
      seen.push(ws.id);
      if (ws.id === "a") throw new Error("bad key");
      return ws.id.toUpperCase();
    });
    expect(seen).toEqual(["a", "c"]);
    expect(out).toEqual([
      { workspaceId: "a", ok: false, error: "bad key" },
      { workspaceId: "c", ok: true, result: "C" },
    ]);
  });
});

describe("resolveBackupAuth", () => {
  it("only ever picks a Google account belonging to the workspace being backed up", async () => {
    const { resolveBackupAuth } = await import("@/server/google-drive-backup");
    await resolveBackupAuth({ id: "b", docsBackupEnabled: true });
    expect(db.userFindFirst).toHaveBeenCalledTimes(2);
    for (const [args] of db.userFindFirst.mock.calls) {
      expect(args.where.memberships).toEqual({ some: { workspaceId: "b" } });
    }
  });

  it("does nothing for a workspace with backup off", async () => {
    const { resolveBackupAuth } = await import("@/server/google-drive-backup");
    expect(await resolveBackupAuth({ id: "a", docsBackupEnabled: false })).toBeNull();
    expect(db.userFindFirst).not.toHaveBeenCalled();
  });
});

describe("docs-gdrive-backup", () => {
  it("backs up only workspaces with backup on, and keeps today's response with one", async () => {
    db.workspaces = [
      { id: "a", docsBackupEnabled: true, docsBackupFolderId: null },
      { id: "b", docsBackupEnabled: false, docsBackupFolderId: null },
    ];
    const { GET } = await import("@/app/api/cron/docs-gdrive-backup/route");
    const body = await (await GET(cronRequest() as never)).json();
    // Workspace a has no connected account in this test, so its run stops there.
    expect(body).toEqual({ reason: "no_connected_backup_account", processed: 0 });
    expect(db.userFindFirst.mock.calls.every(([args]) => args.where.memberships.some.workspaceId === "a")).toBe(true);
  });
});
