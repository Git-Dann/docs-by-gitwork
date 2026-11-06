/**
 * Care's scheduled jobs run once per workspace (Phase 2.2b, Care). The one that matters most is
 * embed-conversations: each business's conversations are selected by its own workspace and
 * embedded with its own key, never another's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspaces: [] as Array<{ id: string; openaiApiKey: string | null; platformAiKeysAllowed: boolean }>,
  unembedded: {} as Record<string, string[]>,
  rawCalls: [] as unknown[][],
}));

const embed = vi.hoisted(() => vi.fn<(id: string, ws: { id: string }, wid?: string) => Promise<void>>(async () => undefined));
const digest = vi.hoisted(() => vi.fn<(id: string) => Promise<void>>(async () => undefined));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findMany: vi.fn(async () => db.workspaces) },
    $queryRawUnsafe: vi.fn(async (_sql: string, workspaceId: string, ...rest: unknown[]) => {
      db.rawCalls.push([_sql, workspaceId, ...rest]);
      return (db.unembedded[workspaceId] ?? []).map((id) => ({ id }));
    }),
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/care-agents/embeddings", () => ({ embedConversation: embed }));
vi.mock("@/server/ai-keys", () => ({
  aiKeyFor: (_p: string, ws: { openaiApiKey: string | null }) => ws.openaiApiKey,
}));
vi.mock("@/server/support-notify", () => ({ postCareDigest: digest }));

process.env.CRON_SECRET = "cron-test-secret";
const cronRequest = () =>
  new Request("http://localhost/api/cron/x", { headers: { authorization: "Bearer cron-test-secret" } }) as unknown as import("next/server").NextRequest;

beforeEach(() => {
  db.workspaces = [];
  db.unembedded = {};
  db.rawCalls = [];
  embed.mockClear();
  digest.mockClear();
});

describe("embed-conversations", () => {
  it("selects each workspace's own conversations and embeds them with that workspace's key", async () => {
    db.workspaces = [
      { id: "a", openaiApiKey: "key-a", platformAiKeysAllowed: true },
      { id: "b", openaiApiKey: "key-b", platformAiKeysAllowed: false },
    ];
    db.unembedded = { a: ["conv-a"], b: ["conv-b"] };
    const { GET } = await import("@/app/api/cron/embed-conversations/route");
    const res = await GET(cronRequest());
    expect(res.status).toBe(200);
    // Each query is filtered on the workspace being processed.
    expect(db.rawCalls.map((c) => c[1])).toEqual(["a", "b"]);
    for (const [sql] of db.rawCalls) expect(String(sql)).toContain(`sc."workspaceId" = $1`);
    expect(embed.mock.calls.map(([id, ws]) => [id, ws.id])).toEqual([
      ["conv-a", "a"],
      ["conv-b", "b"],
    ]);
  });

  it("skips a workspace with no key of its own rather than borrowing another's", async () => {
    db.workspaces = [
      { id: "a", openaiApiKey: "key-a", platformAiKeysAllowed: true },
      { id: "b", openaiApiKey: null, platformAiKeysAllowed: false },
    ];
    db.unembedded = { a: ["conv-a"], b: ["conv-b"] };
    const { GET } = await import("@/app/api/cron/embed-conversations/route");
    await GET(cronRequest());
    expect(embed.mock.calls.map(([id]) => id)).toEqual(["conv-a"]);
  });
});

describe("care-digest", () => {
  it("posts one digest per workspace with Care clients", async () => {
    db.workspaces = [
      { id: "a", openaiApiKey: null, platformAiKeysAllowed: true },
      { id: "b", openaiApiKey: null, platformAiKeysAllowed: true },
    ];
    const { GET } = await import("@/app/api/cron/care-digest/route");
    await GET(cronRequest());
    expect(digest.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
  });
});
