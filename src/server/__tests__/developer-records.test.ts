/**
 * Someone with the Developer role shows under Developers without anyone making them a card.
 * Found on Abdullah Farooq (Nov 2026): a Developer in Settings → Team, missing from Code's
 * Developers list, because that list only counted records with a GitHub handle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Member = { id: string; user: { name: string | null; email: string; avatarUrl: string | null } };

const db = vi.hoisted(() => ({
  missing: [] as Member[],
  created: [] as Array<Record<string, unknown>>,
  locked: [] as string[],
  memberWhere: null as unknown,
  linked: 0,
}));

vi.mock("@/lib/prisma", () => {
  const workspaceMember = {
    count: vi.fn(async (args: { where: unknown }) => {
      db.memberWhere = args.where;
      return db.missing.length;
    }),
    findMany: vi.fn(async (args: { where: unknown; select?: { user?: unknown } }) =>
      // linkStaffRecords reads members by email only; the developer query selects user details.
      args.select && "id" in args.select && args.where && "role" in (args.where as object) ? db.missing : [],
    ),
  };
  const candidate = {
    findMany: vi.fn(async () => []),
    updateMany: vi.fn(),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      db.created.push(args.data);
      return { id: `c${db.created.length}` };
    }),
  };
  const tx = {
    workspaceMember,
    candidate,
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      db.locked.push(String(values[0]));
      return 1;
    }),
  };
  return {
    prisma: {
      workspaceMember,
      candidate,
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

import { ensureDeveloperRecords } from "@/server/staff";
import { DEVELOPER_RECORD, isDeveloperRecord } from "@/server/codeclear-archived";
import { githubLabel } from "@/lib/github-label";

beforeEach(() => {
  db.missing = [];
  db.created = [];
  db.locked = [];
  db.memberWhere = null;
});

describe("which records are developers", () => {
  it("is a GitHub handle OR the Developer role", () => {
    expect(isDeveloperRecord({ githubHandle: "abdullah-f", member: null })).toBe(true);
    expect(isDeveloperRecord({ githubHandle: null, member: { role: "DEVELOPER" } })).toBe(true);
    expect(isDeveloperRecord({ githubHandle: null, member: { role: "STAFF" } })).toBe(false);
    expect(isDeveloperRecord({ githubHandle: null, member: null })).toBe(false);
  });

  it("the list's database filter is the same rule", () => {
    expect(DEVELOPER_RECORD).toEqual({ OR: [{ githubHandle: { not: null } }, { member: { role: "DEVELOPER" } }] });
  });
});

describe("ensureDeveloperRecords", () => {
  it("makes a record for an active Developer who has none, from their account", async () => {
    db.missing = [{ id: "m-af", user: { name: "Abdullah Farooq", email: "abdullahfarooq@gitwork.co.uk", avatarUrl: null } }];
    expect(await ensureDeveloperRecords("w1")).toBe(1);
    expect(db.created).toEqual([
      expect.objectContaining({
        workspaceId: "w1",
        memberId: "m-af",
        name: "Abdullah Farooq",
        email: "abdullahfarooq@gitwork.co.uk",
        githubHandle: null,
        origin: "INTERNAL",
      }),
    ]);
  });

  it("asks only for active Developers with no record, and never placeholder accounts", async () => {
    await ensureDeveloperRecords("w1");
    expect(db.memberWhere).toMatchObject({
      workspaceId: "w1",
      role: "DEVELOPER",
      archivedAt: null,
      staffRecords: { none: {} },
      user: { email: expect.any(Object) },
    });
  });

  it("writes nothing and takes no lock when nobody is missing", async () => {
    expect(await ensureDeveloperRecords("w1")).toBe(0);
    expect(db.created).toEqual([]);
    expect(db.locked).toEqual([]);
  });

  it("creates under a per-workspace lock, so two page loads can't both make one", async () => {
    db.missing = [{ id: "m1", user: { name: null, email: "x@gitwork.co.uk", avatarUrl: null } }];
    await ensureDeveloperRecords("w1");
    expect(db.locked).toEqual(["developer-records:w1"]);
    // No name on the account: the email stands in rather than an empty card.
    expect(db.created[0]).toMatchObject({ name: "x@gitwork.co.uk" });
  });
});

describe("where it runs", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("runs before the Developers list and the Overview counts are read", () => {
    for (const route of ["src/app/api/codeclear/candidates/route.ts", "src/app/api/codeclear/stats/route.ts"]) {
      const s = src(route);
      const ensure = s.indexOf("await ensureDeveloperRecords(workspace.id)");
      expect(ensure, route).toBeGreaterThan(-1);
      expect(ensure, route).toBeLessThan(s.indexOf(route.includes("stats") ? "getCodeClearStats(prisma" : "buildCandidateWhere(workspace.id"));
    }
  });
});

describe("githubLabel", () => {
  it("shows a handle, or says there isn't one yet rather than a bare @", () => {
    expect(githubLabel("abdullah-f")).toBe("@abdullah-f");
    expect(githubLabel("")).toBe("No GitHub yet");
    expect(githubLabel(null)).toBe("No GitHub yet");
  });
});
