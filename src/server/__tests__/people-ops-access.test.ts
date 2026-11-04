/**
 * Siân's access (Nov 2026): Staff + Backstage only, approving Gitwork staff's leave (never
 * developers'), reviewing expenses, and told about both. The rules live in
 * src/types/auth.ts (preset, expense permission), src/server/auth/effective-user.ts
 * (expense gates) and src/server/backstage-people.ts (whose leave).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Member = { id: string; userId: string; role: string; permissions: string[]; email: string };
type Record_ = { memberId: string | null; email: string | null; githubHandle: string | null; isDeveloper: boolean | null; startDate: Date | null };
const db = vi.hoisted(() => ({ members: [] as Member[], records: [] as Record_[] }));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        let rows = db.members;
        const uid = where.userId as { in?: string[] } | undefined;
        if (uid?.in) rows = rows.filter((m) => uid.in!.includes(m.userId));
        const or = where.OR as Array<Record<string, { in: string[] }>> | undefined;
        if (or) {
          const ids = or.find((o) => o.id)?.id.in ?? [];
          const emails = (or.find((o) => o.user) as unknown as { user: { email: { in: string[] } } } | undefined)?.user.email.in ?? [];
          rows = rows.filter((m) => ids.includes(m.id) || emails.includes(m.email.toLowerCase()));
        }
        return rows.map((m) => ({ ...m, user: { id: m.userId, email: m.email } }));
      }),
    },
    candidate: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.OR && Array.isArray(where.OR) && (where.OR as unknown[]).length === 2 && JSON.stringify(where.OR).includes("isDeveloper")) {
          return db.records.filter((r) => r.githubHandle || r.isDeveloper);
        }
        return db.records;
      }),
    },
  },
}));

import {
  DEFAULT_ROLE_PERMISSIONS,
  EMPTY_OVERRIDES,
  PEOPLE_OPS_PERMISSIONS,
  PERMISSION_PRESETS,
  resolveEffectivePermissions,
} from "@/types/auth";
import { canManageExpenses, canReviewExpenses, type EffectiveUser } from "@/server/auth/effective-user";
import { assertLooksAfterLeaveOf, leaveApproverUserIds, looksAfterDevelopers, staffOnlyView } from "@/server/backstage-people";
import { listExpenseReviewerEmails } from "@/server/email";

const user = (over: Partial<EffectiveUser> = {}): EffectiveUser => ({
  id: "u-sian",
  email: "sian@gitwork.co.uk",
  name: "Siân",
  avatarUrl: null,
  role: "STAFF",
  permissions: [...PEOPLE_OPS_PERMISSIONS],
  workspaceId: "w1",
  membershipId: "m-sian",
  ...over,
});

beforeEach(() => {
  db.members = [
    { id: "m-dan", userId: "u-dan", role: "SUPER_ADMIN", permissions: [], email: "dan@gitwork.co.uk" },
    { id: "m-syed", userId: "u-syed", role: "ADMIN", permissions: ["backstage.approve"], email: "syed@gitwork.co.uk" },
    { id: "m-sian", userId: "u-sian", role: "STAFF", permissions: [...PEOPLE_OPS_PERMISSIONS], email: "sian@gitwork.co.uk" },
    { id: "m-dev", userId: "u-dev", role: "DEVELOPER", permissions: ["backstage"], email: "dev@gitwork.co.uk" },
    { id: "m-ops", userId: "u-ops", role: "STAFF", permissions: ["backstage"], email: "ops@gitwork.co.uk" },
  ];
  db.records = [
    { memberId: "m-dev", email: "dev@gitwork.co.uk", githubHandle: "devhandle", isDeveloper: true, startDate: null },
    { memberId: "m-ops", email: "ops@gitwork.co.uk", githubHandle: null, isDeveloper: false, startDate: new Date("2024-03-14") },
  ];
});

describe("the People & office preset", () => {
  const preset = PERMISSION_PRESETS.find((p) => p.id === "people-ops");

  it("is Staff and Backstage, with HR, leave approval and expenses, and nothing else", () => {
    expect(preset?.role).toBe("STAFF");
    const effective = resolveEffectivePermissions("STAFF", DEFAULT_ROLE_PERMISSIONS, {
      grant: PEOPLE_OPS_PERMISSIONS.filter((id) => !DEFAULT_ROLE_PERMISSIONS.STAFF.includes(id)),
      revoke: DEFAULT_ROLE_PERMISSIONS.STAFF.filter((id) => !PEOPLE_OPS_PERMISSIONS.includes(id)),
    });
    expect([...effective].sort()).toEqual([...PEOPLE_OPS_PERMISSIONS].sort());
    for (const notTheirs of ["pulse", "clients", "proposals", "support", "monitors", "seeAllClients", "devsignal"]) {
      expect(effective).not.toContain(notTheirs);
    }
  });
});

describe("expenses are granted per person", () => {
  it("is in no role's defaults, so no Admin gains the ledger by role", () => {
    for (const role of ["ADMIN", "STAFF", "DEVELOPER", "GUEST"] as const) {
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain("backstage.expenses");
    }
    expect(resolveEffectivePermissions("ADMIN", DEFAULT_ROLE_PERMISSIONS, EMPTY_OVERRIDES)).not.toContain("backstage.expenses");
  });

  it("opens and reviews expenses for a Super Admin or a holder, not a leave approver", () => {
    expect(canManageExpenses(user())).toBe(true);
    expect(canReviewExpenses(user())).toBe(true);
    expect(canManageExpenses(user({ role: "SUPER_ADMIN", permissions: [] }))).toBe(true);
    expect(canManageExpenses(user({ role: "ADMIN", permissions: ["backstage", "backstage.approve"] }))).toBe(false);
  });

  it("emails a new expense to Super Admins and holders only", async () => {
    expect((await listExpenseReviewerEmails("w1")).sort()).toEqual(["dan@gitwork.co.uk", "sian@gitwork.co.uk"]);
    expect(await listExpenseReviewerEmails("w1", "u-sian")).toEqual(["dan@gitwork.co.uk"]);
  });
});

describe("a leave approver who isn't an Admin looks after Gitwork staff, not developers", () => {
  it("knows who looks after developers", () => {
    expect(looksAfterDevelopers({ role: "ADMIN" })).toBe(true);
    expect(looksAfterDevelopers({ role: "SUPER_ADMIN" })).toBe(true);
    expect(looksAfterDevelopers({ role: "STAFF" })).toBe(false);
    expect(staffOnlyView(user())).toBe(true);
    expect(staffOnlyView(user({ role: "ADMIN" }))).toBe(false);
    // Not an approver at all: their own views are untouched.
    expect(staffOnlyView(user({ permissions: ["backstage"] }))).toBe(false);
  });

  it("refuses a developer's leave and allows staff, herself and Admins", async () => {
    await expect(assertLooksAfterLeaveOf(user(), "u-dev")).rejects.toThrow(/Admins/);
    await expect(assertLooksAfterLeaveOf(user(), "u-ops")).resolves.toBeUndefined();
    await expect(assertLooksAfterLeaveOf(user(), "u-sian")).resolves.toBeUndefined();
    await expect(assertLooksAfterLeaveOf(user({ id: "u-syed", role: "ADMIN" }), "u-dev")).resolves.toBeUndefined();
  });

  it("tells her about staff leave, and leaves developers' leave to Admins", async () => {
    expect((await leaveApproverUserIds("w1", "u-ops")).sort()).toEqual(["u-dan", "u-sian", "u-syed"]);
    expect((await leaveApproverUserIds("w1", "u-dev")).sort()).toEqual(["u-dan", "u-syed"]);
    // Never tells someone about their own request.
    expect(await leaveApproverUserIds("w1", "u-sian")).not.toContain("u-sian");
  });
});

describe("HQ and the shell for someone with no Portal", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

  it("puts client-work feeds behind Portal and gives approvers and HR their own tiles", () => {
    const src = read("src/components/app-overview.tsx");
    expect(src).toMatch(/GmailWidget,\s+band: "feed",\s+size: "md", module: "clients"/);
    expect(src).toMatch(/CalendarWidget,\s+band: "feed",\s+size: "md", module: "clients"/);
    expect(src).toMatch(/TeamLeaveWidget, band: "summary", size: "sm", module: "backstage.approve"/);
    expect(src).toMatch(/HrWidget,\s+band: "summary", size: "sm", module: "hr.manage"/);
    expect(src).toMatch(/ExpensesWidget,\s+band: "summary", size: "sm", module: "backstage.expenses"/);
  });

  it("only treats someone as a developer on HQ when they work on clients", () => {
    expect(read("src/components/app-overview.tsx")).toMatch(
      /resolvedPermissions\.includes\("clients"\) &&\s+!resolvedPermissions\.includes\("seeAllClients"\)/,
    );
  });

  it("draws HQ for the previewed person's role, so no Admin bypass leaks into a preview", () => {
    const src = read("src/components/app-overview.tsx");
    expect(src).toMatch(/const acct = \{ role: viewRole, permissions: resolvedPermissions \}/);
    expect(src).not.toMatch(/isSuperAdmin\(role\) && workspaceHasModule/);
  });

  it("hides the client-work Desk drawer without Portal", () => {
    expect(read("src/components/app-shell.tsx")).toMatch(/!realPermissions\.includes\("clients"\)\) \? null : \(/);
  });
});

describe("Staff → People for someone who looks after Gitwork's own staff", () => {
  it("puts Gitwork's people first and everyone else (developers) apart", async () => {
    const { splitGitworkStaff } = await import("@/lib/staff");
    const p = (name: string, isDeveloper: boolean) => ({ name, isDeveloper }) as unknown as import("@/lib/staff").StaffPerson;
    const { gitwork, others } = splitGitworkStaff([p("Dan", false), p("Ali", true), p("Siân", false), p("Harry", false), p("Syed", true)]);
    expect(gitwork.map((x) => x.name)).toEqual(["Dan", "Siân", "Harry"]);
    expect(others.map((x) => x.name)).toEqual(["Ali", "Syed"]);
  });

  it("folds the rest only for someone who isn't an Admin, and follows view-as", () => {
    const src = readFileSync(join(process.cwd(), "src/components/staff/staff-roster.tsx"), "utf8");
    expect(src).toMatch(/const \{ isAdmin: looksAfterEveryone \} = useBackstageAccess\(\)/);
    expect(src).toMatch(/const focused = !looksAfterEveryone &&/);
    expect(src).toMatch(/<details[^>]*data-staff-others/);
  });
});
