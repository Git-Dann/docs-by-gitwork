import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { planStaffLinks } from "@/server/staff";
import { buildCandidateWhere } from "@/server/codeclear-candidate-where";
import { filterStaff, normaliseStaffDetails, sortStaff, type StaffPerson } from "@/lib/staff";

const root = join(__dirname, "../../..");

describe("planStaffLinks — linking existing records to accounts by email", () => {
  const members = [
    { id: "m-dan", email: "dan@gitwork.co.uk" },
    { id: "m-sian", email: "Sian@Gitwork.co.uk" },
  ];

  it("links a record to the one member with the same email, ignoring case and spaces", () => {
    expect(planStaffLinks([{ id: "r1", email: " sian@gitwork.co.uk", memberId: null }], members)).toEqual([
      { recordId: "r1", memberId: "m-sian" },
    ]);
  });

  it("never guesses: two records with one email are both left unlinked", () => {
    const records = [
      { id: "r1", email: "dan@gitwork.co.uk", memberId: null },
      { id: "r2", email: "DAN@gitwork.co.uk", memberId: null },
    ];
    expect(planStaffLinks(records, members)).toEqual([]);
  });

  it("never links a member who already has a record", () => {
    const records = [
      { id: "r1", email: "dan@gitwork.co.uk", memberId: "m-dan" },
      { id: "r2", email: "dan@gitwork.co.uk", memberId: null },
    ];
    expect(planStaffLinks(records, members)).toEqual([]);
  });

  it("leaves records with no email, or no matching member, alone", () => {
    expect(
      planStaffLinks(
        [
          { id: "r1", email: null, memberId: null },
          { id: "r2", email: "contractor@elsewhere.com", memberId: null },
        ],
        members,
      ),
    ).toEqual([]);
  });

  it("does nothing once every record is linked, so the lazy backfill stops writing", () => {
    expect(planStaffLinks([{ id: "r1", email: "dan@gitwork.co.uk", memberId: "m-dan" }], members)).toEqual([]);
  });
});

describe("normaliseStaffDetails", () => {
  it("trims text and turns blanks into null", () => {
    const r = normaliseStaffDetails({ jobTitle: "  Designer ", department: "  " });
    expect(r).toEqual({ ok: true, value: { jobTitle: "Designer", department: null } });
  });

  it("refuses an unknown employment type and a malformed date", () => {
    expect(normaliseStaffDetails({ employmentType: "INTERN" as never }).ok).toBe(false);
    expect(normaliseStaffDetails({ startDate: "12/01/2025" }).ok).toBe(false);
    expect(normaliseStaffDetails({ startDate: "2025-13-40" }).ok).toBe(false);
    expect(normaliseStaffDetails({ startDate: "2025-01-12" })).toEqual({ ok: true, value: { startDate: "2025-01-12" } });
  });

  it("leaves fields it wasn't given untouched (undefined), so a PATCH changes only what it names", () => {
    const r = normaliseStaffDetails({ jobTitle: "Lead" });
    expect(r.ok && Object.keys(r.value)).toEqual(["jobTitle"]);
  });
});

const person = (over: Partial<StaffPerson>): StaffPerson => ({
  key: over.key ?? "k",
  memberId: null,
  recordId: null,
  name: "Someone",
  email: null,
  avatarUrl: null,
  role: null,
  jobTitle: null,
  department: null,
  employmentType: null,
  startDate: null,
  managerRecordId: null,
  managerName: null,
  isDeveloper: false,
  primaryStack: null,
  currentClients: [],
  ...over,
});

describe("roster filters", () => {
  const people = [
    person({ key: "a", name: "Ali", memberId: "m1", recordId: "r1", department: "Engineering", currentClients: [{ name: "Wedge", slug: "wedge" }] }),
    person({ key: "b", name: "bea", memberId: "m2", department: "Design", employmentType: "CONTRACTOR" }),
    person({ key: "c", name: "Cara", recordId: "r3", employmentType: "FREELANCER" }),
  ];

  it("searches name, role, department and client", () => {
    expect(filterStaff(people, { q: "wedge" }).map((p) => p.key)).toEqual(["a"]);
    expect(filterStaff(people, { q: "design" }).map((p) => p.key)).toEqual(["b"]);
  });

  it("separates who signs in, who has no login and who has no profile yet", () => {
    expect(filterStaff(people, { presence: "account" }).map((p) => p.key)).toEqual(["a", "b"]);
    expect(filterStaff(people, { presence: "no-account" }).map((p) => p.key)).toEqual(["c"]);
    expect(filterStaff(people, { presence: "no-record" }).map((p) => p.key)).toEqual(["b"]);
  });

  it("sorts by name, ignoring case", () => {
    expect(sortStaff([people[2], people[1], people[0]]).map((p) => p.name)).toEqual(["Ali", "bea", "Cara"]);
  });
});

describe("developer lists stay developers-only", () => {
  it("every developer list query requires a GitHub handle", () => {
    const where = buildCandidateWhere("ws", new URLSearchParams());
    expect(JSON.stringify(where)).toContain('"githubHandle":{"not":null}');
    const archived = buildCandidateWhere("ws", new URLSearchParams("archived=1"));
    expect(JSON.stringify(archived)).toContain('"githubHandle":{"not":null}');
  });

  it("the Overview's counts use the same filter", () => {
    const src = readFileSync(join(root, "src/server/codeclear.ts"), "utf8");
    expect(src).toMatch(/AND: \[activeDeveloperWhere\(await archivedTeamEmails\(workspaceId\)\), DEVELOPER_RECORD\]/);
  });

  it("a missing handle is sent as an empty string, because the iOS app decodes it as a required String", () => {
    const src = readFileSync(join(root, "src/server/codeclear.ts"), "utf8");
    expect(src).toContain('githubHandle: candidate.githubHandle ?? "",');
    const schedule = readFileSync(join(root, "src/server/schedule.ts"), "utf8");
    expect(schedule).toContain('githubHandle: placement.candidate.githubHandle ?? "",');
  });
});

describe("Staff routes are gated", () => {
  it("listing needs the Staff permission; creating and editing need code.manage", () => {
    const list = readFileSync(join(root, "src/app/api/staff/route.ts"), "utf8");
    expect(list).toMatch(/GET[\s\S]*assertCan\(user, canViewStaff/);
    expect(list).toMatch(/POST[\s\S]*assertCan\(user, canManageCode/);
    const edit = readFileSync(join(root, "src/app/api/staff/[id]/route.ts"), "utf8");
    expect(edit).toMatch(/PATCH[\s\S]*assertCan\(user, canManageCode/);
  });

  it("/app/code redirects to Staff, so old links land somewhere", () => {
    const page = readFileSync(join(root, "src/app/(app)/app/code/page.tsx"), "utf8");
    expect(page).toContain('redirect("/app/staff")');
  });
});
