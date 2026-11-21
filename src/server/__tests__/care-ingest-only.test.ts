/**
 * An ingest-only client is off the support desk.
 *
 * Care home read **573 awaiting · 573 unassigned · 19 urgent** across two clients, and 249 of
 * those were Wedge's. We do not do support for Wedge — what we do is ingest course requests from
 * their mailbox into their wiki, a pipeline that creates a `SupportConversation` per email on the
 * way past. `courseRequestOnly` already said so, and already made the sync skip triage for them,
 * but nothing ever excluded those rows from the queue, the totals, the HQ tile or the digest. So
 * nearly half the number telling Gitwork how many customers were waiting on a reply was a
 * byproduct of a golf-course importer.
 *
 * These tests pin the exclusion at the one place every surface reads.
 */
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ groupBy: [] as unknown[], count: [] as unknown[], findMany: [] as unknown[] }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportConversation: {
      groupBy: vi.fn(async (args: unknown) => { calls.groupBy.push(args); return []; }),
      count: vi.fn(async (args: unknown) => { calls.count.push(args); return 0; }),
      findMany: vi.fn(async (args: unknown) => { calls.findMany.push(args); return []; }),
      // `replyStateWhere` compares one column against another with a Prisma field reference.
      fields: { lastInboundAt: Symbol("lastInboundAt"), lastOutboundAt: Symbol("lastOutboundAt") },
    },
    supportClient: {
      count: vi.fn(async (args: unknown) => { calls.count.push(args); return 0; }),
      findMany: vi.fn(async (args: unknown) => { calls.findMany.push(args); return []; }),
    },
    // The per-client count of connectors that have stopped delivering rides in the same batched
    // round trip, and must be scoped to desk clients like everything else here.
    accountConnection: {
      groupBy: vi.fn(async (args: unknown) => { calls.groupBy.push(args); return []; }),
    },
  },
}));

// `support.ts` reaches next-auth through the permission helpers, which will not load here.
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/auth/effective-user", () => ({
  canSeeAllClients: vi.fn(() => true),
  getEffectiveUserOrNull: vi.fn(async () => null),
  requireAuthedUser: vi.fn(async () => null),
  assertCan: vi.fn(),
  canManageSupport: vi.fn(() => true),
  canUseSupport: vi.fn(() => true),
}));

function where(arg: unknown): Record<string, unknown> {
  return (arg as { where?: Record<string, unknown> }).where ?? {};
}

describe("getClientQueueSummaries", () => {
  it("asks for support-desk clients on every one of its queries", async () => {
    calls.groupBy.length = 0;
    const { getClientQueueSummaries } = await import("@/server/support");
    await getClientQueueSummaries("ws-a");

    expect(calls.groupBy.length).toBeGreaterThanOrEqual(6);
    for (const arg of calls.groupBy) {
      const client = where(arg).client as Record<string, unknown>;
      expect(client).toMatchObject({ workspaceId: "ws-a", ingestOnly: false, courseRequestOnly: false });
    }
  });

  it("counts a failing connector only for a desk client", async () => {
    /*
     * An ingest-only client's connector going down is still worth knowing about — but not on the
     * support desk, which is a board of customers waiting on a reply. Wedge's mailbox feeding a
     * golf-course importer is not a customer, and a "Channel down" chip beside a client that is
     * deliberately not on the desk would be the ingest-only exclusion leaking back in through a
     * different column.
     */
    calls.groupBy.length = 0;
    const { getClientQueueSummaries } = await import("@/server/support");
    await getClientQueueSummaries("ws-a");

    const connectorQueries = calls.groupBy.filter((a) => {
      const w = where(a);
      return "health" in w;
    });
    expect(connectorQueries.length).toBe(1);
    expect(where(connectorQueries[0]).health).toBe("ERROR");
    expect(where(connectorQueries[0]).client).toMatchObject({
      workspaceId: "ws-a",
      ingestOnly: false,
      courseRequestOnly: false,
    });
  });

  it("excludes BOTH flags, not just the new one", async () => {
    // ⚠️ Wedge is `courseRequestOnly` and nothing sets `ingestOnly` on it until someone does.
    // Dropping the second clause puts its 249 conversations straight back into the total.
    const { SUPPORT_DESK_CLIENT } = await import("@/server/support");
    expect(SUPPORT_DESK_CLIENT).toEqual({ ingestOnly: false, courseRequestOnly: false });
  });
});

describe("getSupportDashboardSummary", () => {
  it("counts clients, open conversations and recent rows on the desk only", async () => {
    calls.count.length = 0;
    calls.findMany.length = 0;
    const { getSupportDashboardSummary } = await import("@/server/support");
    await getSupportDashboardSummary("ws-a");

    const scoped = [...calls.count, ...calls.findMany].map((a) => {
      const w = where(a);
      return (w.client as Record<string, unknown> | undefined) ?? w;
    });
    expect(scoped.length).toBeGreaterThanOrEqual(3);
    for (const s of scoped) {
      expect(s).toMatchObject({ ingestOnly: false, courseRequestOnly: false });
    }
  });
});

describe("the per-client queue is NOT filtered", () => {
  it("opening an ingest-only client's own queue still counts it honestly", async () => {
    // getConversationViewCounts is per-client and the client was chosen deliberately. Filtering
    // there would show someone an empty queue for a client that demonstrably has conversations,
    // which is a different lie from the one this change removes.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/server/support.ts", "utf8"),
    );
    const fn = src.slice(src.indexOf("export async function getConversationViewCounts"));
    const body = fn.slice(0, fn.indexOf("\nexport "));
    expect(body).not.toContain("SUPPORT_DESK_CLIENT");
  });
});
