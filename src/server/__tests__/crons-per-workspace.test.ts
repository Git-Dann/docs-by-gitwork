/**
 * Scheduled jobs run once per workspace, each with its own settings, and none crosses into
 * another business's data or keys (docs/multi-tenant-roadmap.md, Phase 2).
 *
 * With one workspace (Gitwork today) every job must behave as it did; with two, each is
 * processed with ITS settings. Prisma is mocked: the database-backed proof lives in
 * tests/isolation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspaces: [] as Array<Record<string, unknown> & { id: string }>,
  queryRaw: vi.fn(),
  connections: vi.fn(),
  userFindFirst: vi.fn(),
  workspaceFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        db.workspaces.filter((w) => !where || Object.entries(where).every(([k, v]) => w[k] === v)),
      ),
      findUnique: db.workspaceFindUnique,
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const ws = db.workspaces.find((w) => w.id === where.id);
        if (!ws) throw new Error("not found");
        return ws;
      }),
    },
    accountConnection: { findMany: db.connections, update: vi.fn(async () => ({})) },
    supportAnalyticsSnapshot: { upsert: vi.fn() },
    user: { findFirst: db.userFindFirst },
    $queryRawUnsafe: db.queryRaw,
  },
}));

// next-auth's ESM entry can't load in Node; the cron guard only needs its error class.
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/care-agents/embeddings", () => ({ embedConversation: vi.fn(async () => undefined) }));

process.env.CRON_SECRET = "cron-test-secret";
const cronRequest = () =>
  new Request("http://localhost/api/cron/x", { headers: { authorization: "Bearer cron-test-secret" } });

beforeEach(() => {
  db.workspaces = [];
  db.queryRaw.mockReset().mockResolvedValue([]);
  db.connections.mockReset().mockResolvedValue([]);
  db.userFindFirst.mockReset().mockResolvedValue(null);
  db.workspaceFindUnique.mockReset().mockResolvedValue(null);
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

describe("embed-conversations", () => {
  it("embeds each workspace's own conversations with its own key, never another's", async () => {
    const { embedConversation } = await import("@/server/care-agents/embeddings");
    db.workspaces = [
      { id: "a", openaiApiKey: "sk-a", platformAiKeysAllowed: false },
      { id: "b", openaiApiKey: "sk-b", platformAiKeysAllowed: false },
      { id: "c", openaiApiKey: null, platformAiKeysAllowed: false },
    ];
    db.queryRaw.mockImplementation(async (_sql: string, _limit: number, wsId: string) => [{ id: `conv-${wsId}` }]);
    const { GET } = await import("@/app/api/cron/embed-conversations/route");
    const res = await GET(cronRequest() as never);
    const body = await res.json();

    // The query is scoped to the workspace it runs for, and a workspace with no key runs nothing.
    expect(db.queryRaw).toHaveBeenCalledTimes(2);
    for (const call of db.queryRaw.mock.calls) expect(call[0]).toMatch(/s\."workspaceId" = \$2/);
    expect(db.queryRaw.mock.calls.map((c) => c[2])).toEqual(["a", "b"]);
    const calls = vi.mocked(embedConversation).mock.calls.map(([conv, ws, wsId]) => [conv, (ws as { openaiApiKey: string }).openaiApiKey, wsId]);
    expect(calls).toEqual([
      ["conv-a", "sk-a", "a"],
      ["conv-b", "sk-b", "b"],
    ]);
    expect(body).toMatchObject({ total: 2, embedded: 2, errors: [] });
  });
});

describe("analytics-snapshot and support-sync read each workspace's own connectors", () => {
  it("analytics-snapshot queries connections per workspace", async () => {
    db.workspaces = [{ id: "a" }, { id: "b" }];
    const { GET } = await import("@/app/api/cron/analytics-snapshot/route");
    const body = await (await GET(cronRequest() as never)).json();
    expect(db.connections.mock.calls.map((c) => c[0].where)).toEqual([
      { source: "ANALYTICS", client: { workspaceId: "a" } },
      { source: "ANALYTICS", client: { workspaceId: "b" } },
    ]);
    // The response keeps the keys it always had.
    expect(body).toMatchObject({ total: 0, captured: 0, errors: [] });
    expect(typeof body.period).toBe("string");
  });

  it("support-sync queries connections per workspace", async () => {
    db.workspaces = [{ id: "a" }, { id: "b" }];
    const { GET } = await import("@/app/api/cron/support-sync/route");
    const body = await (await GET(cronRequest() as never)).json();
    expect(db.connections.mock.calls.map((c) => c[0].where)).toEqual([
      { health: "CONNECTED", client: { workspaceId: "a" } },
      { health: "CONNECTED", client: { workspaceId: "b" } },
    ]);
    expect(body).toMatchObject({ total: 0, ingested: 0, filtered: 0, errors: [] });
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

describe("care digest", () => {
  it("looks at every workspace, each through its own settings", async () => {
    db.workspaces = [{ id: "a" }, { id: "b" }];
    const { postCareDigestForEveryWorkspace } = await import("@/server/support-notify");
    expect(await postCareDigestForEveryWorkspace()).toBe(2);
    expect(db.workspaceFindUnique.mock.calls.map(([args]) => args.where.id)).toEqual(["a", "b"]);
  });
});
