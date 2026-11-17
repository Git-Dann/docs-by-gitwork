import { describe, expect, it } from "vitest";
import { mergePlan, mergedFields, type MergeSide } from "@/lib/staff-merge";

const side = (over: Partial<MergeSide>): MergeSide => ({
  id: "a",
  name: "A",
  createdAt: new Date("2026-06-10"),
  memberId: null,
  githubHandle: null,
  hasPersonalDetails: false,
  ...over,
});

// The real case (Nov 2026): an old developer card with no email and the record made for his login.
const oldCard = side({ id: "old", name: "Hassaan", createdAt: new Date("2026-06-10"), githubHandle: "hassaan" });
const loginRecord = side({ id: "new", name: "Hassaan Bin Sajjad", createdAt: new Date("2026-10-30"), memberId: "m1" });

describe("mergePlan", () => {
  it("keeps the older record, whichever page the merge starts from", () => {
    expect(mergePlan(oldCard, loginRecord)).toEqual({ ok: true, keepId: "old", dropId: "new" });
    expect(mergePlan(loginRecord, oldCard)).toEqual({ ok: true, keepId: "old", dropId: "new" });
  });

  it("refuses two different logins", () => {
    const r = mergePlan(side({ id: "a", memberId: "m1" }), side({ id: "b", memberId: "m2" }));
    expect(r.ok).toBe(false);
  });

  it("refuses two different GitHub handles, but not the same one in another case or with blanks", () => {
    expect(mergePlan(side({ id: "a", githubHandle: "x" }), side({ id: "b", githubHandle: "y" })).ok).toBe(false);
    expect(mergePlan(side({ id: "a", githubHandle: "Hassaan" }), side({ id: "b", githubHandle: "hassaan" })).ok).toBe(true);
    expect(mergePlan(side({ id: "a", githubHandle: "x" }), side({ id: "b", githubHandle: "" })).ok).toBe(true);
  });

  it("refuses when both hold personal details, so neither set is silently lost", () => {
    expect(mergePlan(side({ id: "a", hasPersonalDetails: true }), side({ id: "b", hasPersonalDetails: true })).ok).toBe(false);
    expect(mergePlan(side({ id: "a", hasPersonalDetails: true }), side({ id: "b" })).ok).toBe(true);
  });

  it("refuses merging a record with itself", () => {
    expect(mergePlan(oldCard, oldCard).ok).toBe(false);
  });
});

describe("mergedFields", () => {
  const keep = {
    name: "Hassaan",
    email: null,
    memberId: null,
    githubHandle: "hassaan",
    jobTitle: null,
    department: null,
    employmentType: null,
    startDate: null,
    primaryStack: "Frontend",
    techStacks: ["Frontend", "Backend"],
    signalSources: [],
    isDeveloper: true,
    archivedAt: null,
  };
  const drop = {
    name: "Hassaan Bin Sajjad",
    email: "hassaan.binsajjad@gitwork.co.uk",
    memberId: "m1",
    githubHandle: null,
    jobTitle: "Product Manager",
    department: "Product",
    employmentType: "CONTRACTOR",
    startDate: new Date("2025-12-15"),
    primaryStack: "",
    techStacks: [],
    signalSources: [],
    isDeveloper: false,
    archivedAt: null,
  };

  it("fills every blank on the kept record from the other, and takes the login's name", () => {
    expect(mergedFields(keep, drop)).toEqual({
      name: "Hassaan Bin Sajjad",
      email: "hassaan.binsajjad@gitwork.co.uk",
      memberId: "m1",
      jobTitle: "Product Manager",
      department: "Product",
      employmentType: "CONTRACTOR",
      startDate: new Date("2025-12-15"),
    });
  });

  it("never overwrites a value the kept record already has", () => {
    const out = mergedFields({ ...keep, jobTitle: "Developer", primaryStack: "Frontend" }, { ...drop, primaryStack: "Mobile" });
    expect(out.jobTitle).toBeUndefined();
    expect(out.primaryStack).toBeUndefined();
  });

  it("keeps the old name when the login was already on the kept record", () => {
    expect(mergedFields({ ...keep, memberId: "m1" }, drop).name).toBeUndefined();
  });

  it("joins stack lists and keeps them a developer if either was", () => {
    const out = mergedFields({ ...keep, techStacks: ["Frontend"], isDeveloper: false, githubHandle: null }, { ...drop, techStacks: ["Mobile"], githubHandle: "h" });
    expect(out.techStacks).toEqual(["Frontend", "Mobile"]);
    expect(out.isDeveloper).toBe(true);
  });

  it("stays on the active roster unless both were archived", () => {
    expect(mergedFields({ ...keep, archivedAt: new Date() }, drop)).toMatchObject({ archivedAt: null, archivedById: null });
    expect(mergedFields({ ...keep, archivedAt: new Date() }, { ...drop, archivedAt: new Date() }).archivedAt).toBeUndefined();
  });
});
