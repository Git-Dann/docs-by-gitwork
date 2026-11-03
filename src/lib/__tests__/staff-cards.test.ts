/**
 * People as cards (docs/hr-platform.md): grouping under headings, the org chart drawn
 * from managers, the CSV export, and HR's reminders.
 */
import { describe, expect, it } from "vitest";
import { buildOrgTree, groupStaff, staffGroupOf, staffToCsv, type StaffPerson } from "@/lib/staff";
import { comingUpWithin, missingDetailsFor, type ComingUpItem } from "@/lib/hr";

const person = (key: string, over: Partial<StaffPerson> = {}): StaffPerson => ({
  key,
  memberId: null,
  recordId: key,
  name: key,
  preferredName: null,
  pronouns: null,
  archivedAt: null,
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

describe("groupStaff", () => {
  it("puts people under Admins, Staff, Developers, Guests, No login, in that order", () => {
    const groups = groupStaff([
      person("dev", { role: "DEVELOPER" }),
      person("none"),
      person("dan", { role: "SUPER_ADMIN" }),
      person("sian", { role: "STAFF" }),
      person("harry", { role: "ADMIN" }),
    ]);
    expect(groups.map((g) => [g.label, g.people.map((p) => p.key)])).toEqual([
      ["Admins", ["dan", "harry"]],
      ["Staff", ["sian"]],
      ["Developers", ["dev"]],
      ["No login", ["none"]],
    ]);
  });

  it("files an unknown role under Staff rather than No login, since they do sign in", () => {
    expect(staffGroupOf({ role: "SOMETHING_NEW" })).toBe("staff");
    expect(staffGroupOf({ role: null })).toBe("no-login");
  });
});

describe("buildOrgTree", () => {
  it("nests reports under their manager", () => {
    const tree = buildOrgTree([person("a"), person("b", { managerRecordId: "a" }), person("c", { managerRecordId: "b" })]);
    expect(tree.map((n) => n.person.key)).toEqual(["a"]);
    expect(tree[0].reports[0].person.key).toBe("b");
    expect(tree[0].reports[0].reports[0].person.key).toBe("c");
  });

  it("makes someone a root when their manager isn't on the list", () => {
    expect(buildOrgTree([person("b", { managerRecordId: "gone" })]).map((n) => n.person.key)).toEqual(["b"]);
  });

  it("never drops anyone or loops forever when managers form a circle", () => {
    const tree = buildOrgTree([person("a", { managerRecordId: "b" }), person("b", { managerRecordId: "a" })]);
    const keys: string[] = [];
    const walk = (ns: typeof tree) => ns.forEach((n) => (keys.push(n.person.key), walk(n.reports)));
    walk(tree);
    expect(keys.sort()).toEqual(["a", "b"]);
  });
});

describe("staffToCsv", () => {
  it("quotes commas and neutralises formula-looking text", () => {
    const csv = staffToCsv([person("x", { name: "=HYPERLINK(1)", jobTitle: "Lead, delivery" })]);
    const row = csv.split("\n")[1];
    expect(row.startsWith("'=HYPERLINK(1)")).toBe(true);
    expect(row).toContain('"Lead, delivery"');
  });

  it("never includes rates or personal details", () => {
    expect(staffToCsv([]).split("\n")[0]).toBe("Name,Email,Role,Job title,Department,Type,Started,Manager,Clients");
  });
});

describe("HR reminders", () => {
  const item = (date: string, name = "x"): ComingUpItem => ({ kind: "contract-end", date, name, href: "/" });

  it("keeps the next 60 days and anything already passed, soonest first", () => {
    const out = comingUpWithin([item("2027-01-01"), item("2026-11-20", "b"), item("2026-10-01", "a")], "2026-10-29");
    expect(out.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("asks for a supplier only from contractors, and a manager only below the top", () => {
    const base = { employmentType: "EMPLOYEE", startDate: "2026-01-01", managerRecordId: "m", supplierId: null, hasSensitive: true, isTopOfTree: false };
    expect(missingDetailsFor(base)).toEqual([]);
    expect(missingDetailsFor({ ...base, employmentType: "CONTRACTOR" })).toEqual(["supplier"]);
    expect(missingDetailsFor({ ...base, managerRecordId: null, isTopOfTree: true })).toEqual([]);
    expect(missingDetailsFor({ ...base, managerRecordId: null })).toEqual(["manager"]);
    expect(missingDetailsFor({ ...base, hasSensitive: false })).toEqual(["personal details"]);
  });
});
