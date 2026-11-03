/**
 * Approving a release: from the client's page only this wiki's pending entries move, the
 * approver is recorded and named in Slack, and the internal routes are scoped to the client
 * in the URL (they once acted on any id, unauthenticated).
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; wikiId: string; status: string; approvedAt: Date | null; approvedByName: string | null; version: string; title: string; platform: string };
const db = vi.hoisted(() => ({ rows: [] as Row[] }));
const notified = vi.hoisted(() => [] as Array<{ id: string; approvedBy?: string | null }>);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientChangelogEntry: {
      findMany: vi.fn(async ({ where }: { where: { wikiId: string; id: { in: string[] } } }) =>
        db.rows.filter((r) => r.wikiId === where.wikiId && where.id.in.includes(r.id) && r.status !== "APPROVED").map((r) => ({ id: r.id })),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = db.rows.find((x) => x.id === where.id && x.status !== "APPROVED");
        if (!r) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.rows.find((r) => r.id === where.id) ?? null),
    },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/wiki-slack-notify", async (orig) => ({
  ...(await orig<typeof import("@/server/wiki-slack-notify")>()),
  notifyClientSlackChangelogApproved: (e: { id: string; approvedBy?: string | null }) => notified.push(e),
  notifyClientSlackChangelogPending: () => undefined,
}));

import { approveChangelogEntries } from "@/server/wiki";
import { changelogApprovedText } from "@/server/wiki-slack-notify";

const row = (id: string, wikiId: string, status = "PENDING"): Row => ({
  id, wikiId, status, approvedAt: null, approvedByName: null, version: "2.0.3", title: "Wedge+ Is Here", platform: "IOS",
});

beforeEach(() => {
  db.rows = [row("ios", "wedge"), row("android", "wedge"), row("done", "wedge", "APPROVED"), row("other", "someone-else")];
  notified.length = 0;
});

describe("approving from the client's page", () => {
  it("approves this wiki's pending entries, records who, and names them in Slack", async () => {
    const n = await approveChangelogEntries("wedge", ["ios", "android"], "Luke McFarland");
    expect(n).toBe(2);
    for (const id of ["ios", "android"]) {
      const r = db.rows.find((x) => x.id === id)!;
      expect(r.status).toBe("APPROVED");
      expect(r.approvedByName).toBe("Luke McFarland");
      expect(r.approvedAt).toBeInstanceOf(Date);
    }
    expect(notified.map((e) => e.approvedBy)).toEqual(["Luke McFarland", "Luke McFarland"]);
  });

  it("never touches another client's entry, even given its id", async () => {
    expect(await approveChangelogEntries("wedge", ["other"], "Luke")).toBe(0);
    expect(db.rows.find((r) => r.id === "other")!.status).toBe("PENDING");
  });

  it("leaves an already-approved release alone and doesn't ping again", async () => {
    expect(await approveChangelogEntries("wedge", ["done"], "Luke")).toBe(0);
    expect(notified).toHaveLength(0);
  });

  it("says who approved it in Slack", () => {
    const base = { id: "a", wikiId: "w", version: "2.0.3", title: "Wedge+ Is Here", platform: "IOS" };
    expect(changelogApprovedText("Wedge", [{ ...base, approvedBy: "Luke McFarland" }])).toContain("approved for iOS by Luke McFarland");
    expect(changelogApprovedText("Wedge", [base])).not.toContain(" by ");
  });
});

describe("the routes are guarded", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("every internal changelog write resolves the caller and scopes the entry to the URL's client", () => {
    const entry = read("src/app/api/clients/[slug]/wiki/changelog/[id]/route.ts");
    for (const handler of ["PATCH", "DELETE"]) {
      const body = entry.slice(entry.indexOf(`export async function ${handler}`));
      const end = body.indexOf("\nexport async function", 10);
      const fn = end === -1 ? body : body.slice(0, end);
      expect(fn, handler).toContain("resolveInternalChangelog(");
      expect(fn, handler).toContain("assertEntryInWiki(id, wikiId)");
    }
    const create = read("src/app/api/clients/[slug]/wiki/changelog/route.ts");
    expect(create).toContain("resolveInternalChangelog(");
    expect(create).not.toContain("ensureBaseRecords");
  });

  it("the client's approve route resolves who is approving before it reads the body", () => {
    const route = read("src/app/api/wiki/[token]/changelog/approve/route.ts");
    expect(route.indexOf("resolveChangelogApprover(")).toBeGreaterThan(-1);
    expect(route.indexOf("resolveChangelogApprover(")).toBeLessThan(route.indexOf("bodySchema.parse("));
    expect(route).toContain("assertApproveRate(");
  });
});
