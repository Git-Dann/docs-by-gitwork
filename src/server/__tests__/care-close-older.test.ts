/**
 * "Close everything before a date", at the database edge.
 *
 * Three rules decide whether this is safe, and none of them is obvious from the code:
 *  - it selects on `lastMessageAt`, never `receivedAt`;
 *  - it never touches a snoozed or already-closed row;
 *  - it never stamps `firstTriagedAt`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ updateMany: [] as unknown[], audit: [] as unknown[], count: [] as unknown[] }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportConversation: {
      updateMany: vi.fn(async (a: unknown) => { calls.updateMany.push(a); return { count: 7 }; }),
      count: vi.fn(async (a: unknown) => { calls.count.push(a); return 7; }),
    },
    supportAuditLog: {
      create: vi.fn(async (a: unknown) => {
        calls.audit.push(a);
        return { id: "log_1", clientId: "c1", actorId: null, action: "x", target: null, metadata: {}, createdAt: new Date() };
      }),
    },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/auth/effective-user", () => ({
  canSeeAllClients: vi.fn(() => true),
  getEffectiveUserOrNull: vi.fn(async () => null),
  requireAuthedUser: vi.fn(async () => null),
  assertCan: vi.fn(),
  canManageSupport: vi.fn(() => true),
  canUseSupport: vi.fn(() => true),
}));

const BEFORE = new Date("2026-11-13T00:00:00.000Z");
const where = (a: unknown) => (a as { where: Record<string, unknown> }).where;
const data = (a: unknown) => (a as { data: Record<string, unknown> }).data;

beforeEach(() => {
  calls.updateMany.length = 0;
  calls.audit.length = 0;
  calls.count.length = 0;
  vi.clearAllMocks();
});

describe("closeConversationsOlderThan", () => {
  it("⚠️ selects on lastMessageAt and never on receivedAt", async () => {
    /*
     * `receivedAt` is stamped once at creation and never updated (§42.1 defect 4) — it is when
     * the THREAD started. Selecting on it would close an old thread that got a reply yesterday,
     * which is a live customer waiting.
     */
    const { closeConversationsOlderThan } = await import("@/server/support");
    await closeConversationsOlderThan("c1", BEFORE);
    const w = where(calls.updateMany[0]);
    expect(w.lastMessageAt).toEqual({ not: null, lt: BEFORE });
    expect(w).not.toHaveProperty("receivedAt");
  });

  it("⚠️ never closes a row whose age it does not know", async () => {
    // A null lastMessageAt means the activity backfill has not reached it. "We cannot tell" is
    // not "it is old" (§35) — hence `not: null` in the predicate, asserted on its own so
    // dropping it fails a test named for the reason.
    const { closeConversationsOlderThan } = await import("@/server/support");
    await closeConversationsOlderThan("c1", BEFORE);
    const w = where(calls.updateMany[0]);
    expect((w.lastMessageAt as { not?: unknown }).not).toBe(null);
  });

  it("only touches NEW and OPEN — a snooze is a decision with a wake date on it", async () => {
    const { closeConversationsOlderThan } = await import("@/server/support");
    await closeConversationsOlderThan("c1", BEFORE);
    expect(where(calls.updateMany[0]).status).toEqual({ in: ["NEW", "OPEN"] });
  });

  it("⚠️ never stamps firstTriagedAt", async () => {
    /*
     * `batchUpdateConversations` does, and is right to for a human bulk-close. These rows were
     * never triaged. Stamping them would tell getPerformanceMetricsForPeriod that we first
     * responded to an August thread in November, and quietly poison the first-response figure in
     * every report that has already been sent.
     */
    const { closeConversationsOlderThan } = await import("@/server/support");
    await closeConversationsOlderThan("c1", BEFORE);
    for (const call of calls.updateMany) {
      expect(data(call)).not.toHaveProperty("firstTriagedAt");
    }
  });

  it("marks the batch so that run alone can be undone", async () => {
    const { closeConversationsOlderThan } = await import("@/server/support");
    const res = await closeConversationsOlderThan("c1", BEFORE);
    expect(data(calls.updateMany[0]).closedReason).toBe("reset:log_1");
    expect(res.batchId).toBe("log_1");
    expect(res.closed).toBe(7);
  });

  it("records the cutoff AND the count, so nothing-happened differs from nothing-to-do", async () => {
    const { closeConversationsOlderThan } = await import("@/server/support");
    await closeConversationsOlderThan("c1", BEFORE);
    const done = calls.audit.map((a) => data(a)).find((d) => d.action === "conversations_bulk_closed_done");
    expect(done).toBeTruthy();
    expect((done!.metadata as Record<string, unknown>).closed).toBe(7);
    expect((done!.metadata as Record<string, unknown>).before).toBe(BEFORE.toISOString());
  });

  it("clears unread, so the badge drops with the queue", async () => {
    const { closeConversationsOlderThan } = await import("@/server/support");
    await closeConversationsOlderThan("c1", BEFORE);
    expect(data(calls.updateMany[0]).unread).toBe(false);
  });
});

describe("undoConversationReset", () => {
  it("reopens that batch and nothing else", async () => {
    const { undoConversationReset } = await import("@/server/support");
    await undoConversationReset("c1", "log_1");
    const w = where(calls.updateMany[0]);
    // Scoped to the marker, not to a date: a second run — or a conversation someone closed by
    // hand in between — must never be reopened by undoing the first.
    expect(w.closedReason).toBe("reset:log_1");
    expect(w.status).toBe("CLOSED");
    expect(w.clientId).toBe("c1");
    expect(w).not.toHaveProperty("lastMessageAt");
    expect(data(calls.updateMany[0])).toMatchObject({ status: "OPEN", closedAt: null, closedReason: null });
  });
});

describe("countConversationsOlderThan", () => {
  it("counts exactly what the run would close", async () => {
    // A dry run that disagrees with the run is worse than no dry run.
    const { closeConversationsOlderThan, countConversationsOlderThan } = await import("@/server/support");
    await countConversationsOlderThan("c1", BEFORE);
    const counted = where(calls.count[0]);
    calls.updateMany.length = 0;
    await closeConversationsOlderThan("c1", BEFORE);
    expect(counted).toEqual(where(calls.updateMany[0]));
  });
});
