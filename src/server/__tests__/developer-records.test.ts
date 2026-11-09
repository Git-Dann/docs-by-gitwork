/**
 * Who is a developer is a fact on the Staff record (`isDeveloper`), set by people: when they're
 * invited as one, or in their profile. Not the permission role, because everyone signs in as
 * DEVELOPER (CLAUDE.md §57.6). Found on Abdullah Farooq (Nov 2026), who was missing from Code →
 * Developers; the first fix used the role, which would have listed every new hire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Member = { id: string; workspaceId: string; user: { name: string | null; email: string; avatarUrl: string | null } };

const db = vi.hoisted(() => ({
  undecided: 0,
  missing: [] as Member[],
  created: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
  locked: [] as string[],
  countWheres: [] as unknown[],
}));

vi.mock("@/lib/prisma", () => {
  const workspaceMember = {
    count: vi.fn(async (args: { where: unknown }) => {
      db.countWheres.push(args.where);
      return db.missing.length;
    }),
    findMany: vi.fn(async (args: { where: Record<string, unknown>; distinct?: unknown }) => {
      if (args.distinct) return [...new Set(db.missing.map((m) => m.workspaceId))].map((workspaceId) => ({ workspaceId }));
      return "role" in args.where ? db.missing : [];
    }),
  };
  const candidate = {
    count: vi.fn(async (args: { where: unknown }) => {
      db.countWheres.push(args.where);
      return db.undecided;
    }),
    findMany: vi.fn(async () => []),
    updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      db.updates.push(args);
      return { count: 1 };
    }),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      db.created.push(args.data);
      return { id: `c${db.created.length}` };
    }),
  };
  const tx = {
    workspaceMember,
    candidate,
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      db.locked.push(strings.join("?"));
      return 1;
    }),
  };
  return { prisma: { workspaceMember, candidate, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});

import { backfillDeveloperFlags, DEVELOPER_FLAG_SINCE } from "@/server/staff-developer-flag";
import { DEVELOPER_RECORD, MISSING_DEVELOPER_DETAILS, isDeveloperRecord } from "@/server/codeclear-archived";
import { buildCandidateWhere } from "@/server/codeclear-candidate-where";
import { githubLabel } from "@/lib/github-label";
import { normaliseStaffDetails } from "@/lib/staff";

beforeEach(() => {
  db.undecided = 0;
  db.missing = [];
  db.created = [];
  db.updates = [];
  db.locked = [];
  db.countWheres = [];
});

describe("which records are developers", () => {
  it("is a GitHub handle OR the developer flag, and never the role", () => {
    expect(isDeveloperRecord({ githubHandle: "abdullah-f", isDeveloper: false })).toBe(true);
    expect(isDeveloperRecord({ githubHandle: null, isDeveloper: true })).toBe(true);
    expect(isDeveloperRecord({ githubHandle: null, isDeveloper: false })).toBe(false);
    // Undecided (a record from before the flag that the backfill hasn't settled) isn't listed.
    expect(isDeveloperRecord({ githubHandle: null, isDeveloper: null })).toBe(false);
  });

  it("the list's database filter is the same rule", () => {
    expect(DEVELOPER_RECORD).toEqual({ OR: [{ githubHandle: { not: null } }, { isDeveloper: true }] });
    expect(JSON.stringify(DEVELOPER_RECORD)).not.toContain("role");
  });

  it("the profile form carries the switch", () => {
    expect(normaliseStaffDetails({ isDeveloper: true })).toEqual({ ok: true, value: { isDeveloper: true } });
    expect(normaliseStaffDetails({})).toEqual({ ok: true, value: {} });
  });
});

describe("backfillDeveloperFlags (settles the people already here, once)", () => {
  it("does nothing, and takes no lock, once everything's decided", async () => {
    expect(await backfillDeveloperFlags()).toEqual({ created: 0, flagged: 0, cleared: 0 });
    expect(db.locked).toEqual([]);
    expect(db.updates).toEqual([]);
  });

  it("gives a record to a Developer who has none, marked as a developer", async () => {
    db.missing = [{ id: "m-af", workspaceId: "w1", user: { name: "Abdullah Farooq", email: "abdullahfarooq@gitwork.co.uk", avatarUrl: null } }];
    const result = await backfillDeveloperFlags();
    expect(result.created).toBe(1);
    expect(db.created[0]).toMatchObject({ workspaceId: "w1", memberId: "m-af", name: "Abdullah Farooq", isDeveloper: true, githubHandle: null });
    expect(db.locked.join()).toContain("pg_advisory_xact_lock");
  });

  it("marks undecided records from what was true before (handle or Developer role), then settles the rest as not", async () => {
    db.undecided = 3;
    await backfillDeveloperFlags();
    expect(db.updates).toHaveLength(2);
    const [flag, clear] = db.updates;
    expect(flag.data).toEqual({ isDeveloper: true });
    expect(flag.where).toMatchObject({ isDeveloper: null, OR: [{ githubHandle: { not: null } }, { member: { role: "DEVELOPER" } }] });
    expect(clear.data).toEqual({ isDeveloper: false });
    expect(clear.where).toMatchObject({ isDeveloper: null });
  });

  it("only ever looks at records and memberships from before the flag existed", async () => {
    db.undecided = 1;
    db.missing = [{ id: "m1", workspaceId: "w1", user: { name: "X", email: "x@gitwork.co.uk", avatarUrl: null } }];
    await backfillDeveloperFlags();
    for (const w of db.countWheres) expect(w).toMatchObject({ createdAt: { lt: DEVELOPER_FLAG_SINCE } });
    for (const u of db.updates) expect(u.where).toMatchObject({ createdAt: { lt: DEVELOPER_FLAG_SINCE } });
  });
});

describe("filters", () => {
  it("missing=1 narrows Developers to those without a handle or stack", () => {
    const w = buildCandidateWhere("w1", new URLSearchParams("missing=1"), []);
    expect(w.AND).toContainEqual(MISSING_DEVELOPER_DETAILS);
    expect(buildCandidateWhere("w1", new URLSearchParams(), []).AND).not.toContainEqual(MISSING_DEVELOPER_DETAILS);
  });
});

describe("wiring", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (n === "__tests__" || n === "node_modules") return [];
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
    });

  it("no page load makes records any more: lists only read", () => {
    for (const route of ["src/app/api/codeclear/candidates/route.ts", "src/app/api/codeclear/stats/route.ts"]) {
      expect(src(route), route).not.toMatch(/ensureDeveloperRecords|markMemberAsDeveloper|candidate\.create\(\{\s*data: \{\s*workspaceId,\s*memberId/);
    }
  });

  it("every place that accepts an invite applies its developer flag", () => {
    // An invite write that marks it accepted: workspaceInvite.update(...) carrying status "ACCEPTED".
    // A fresh RegExp per use: a /g pattern's .test() keeps lastIndex between files.
    const ACCEPT = () => /workspaceInvite\.update\(\{[\s\S]{0,200}?status: "ACCEPTED"/g;
    const accepting = walk(join(process.cwd(), "src/server")).filter((f) => ACCEPT().test(readFileSync(f, "utf8")));
    expect(accepting.length).toBeGreaterThanOrEqual(2);
    for (const f of accepting) {
      const s = readFileSync(f, "utf8");
      const accepts = s.match(ACCEPT())!.length;
      const applies = (s.match(/applyInviteDeveloperFlag\(/g) ?? []).length - (/export async function applyInviteDeveloperFlag/.test(s) ? 1 : 0);
      expect(applies, f).toBeGreaterThanOrEqual(accepts);
    }
  });

  it("the invite route passes the flag through", () => {
    expect(src("src/app/api/team/invites/route.ts")).toMatch(/isDeveloper: body\.isDeveloper \?\? false/);
  });
});

describe("githubLabel", () => {
  it("shows a handle, or says there isn't one yet rather than a bare @", () => {
    expect(githubLabel("abdullah-f")).toBe("@abdullah-f");
    expect(githubLabel("")).toBe("No GitHub yet");
    expect(githubLabel(null)).toBe("No GitHub yet");
  });
});
