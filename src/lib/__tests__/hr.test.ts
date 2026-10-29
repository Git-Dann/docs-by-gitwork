/**
 * People & HR rules (docs/hr-platform.md, Phase 1). These decide who sees a person's
 * employment and personal details, so most of them are about NOT showing something.
 */
import { describe, expect, it } from "vitest";
import {
  changedSensitiveFields,
  dateAttention,
  formatNiNumber,
  normaliseEmployment,
  normaliseNiNumber,
  normaliseSensitive,
  normaliseSupplier,
  parseSensitive,
  profileAccess,
  shouldLogSensitiveView,
  EMPTY_SENSITIVE,
} from "@/lib/hr";
import { DEFAULT_ROLE_PERMISSIONS, HR_PERMISSION_IDS, resolveEffectivePermissions, EMPTY_OVERRIDES } from "@/types/auth";

const none = { canViewStaff: false, canManageStaff: false, canManageHr: false, canViewSensitive: false };
const TODAY = "2026-10-29";

describe("profileAccess", () => {
  it("lets a person see all of their own record, including personal details", () => {
    const a = profileAccess({ ...none, relation: "self" });
    expect(a).toMatchObject({ directory: true, employment: true, sensitive: true, editSensitive: true });
    // …but not change their own employment terms or read the HR log.
    expect(a.editEmployment).toBe(false);
    expect(a.accessLog).toBe(false);
  });

  it("gives a manager employment details but never personal ones", () => {
    const a = profileAccess({ ...none, relation: "manager", canViewStaff: true });
    expect(a.employment).toBe(true);
    expect(a.sensitive).toBe(false);
    expect(a.editSensitive).toBe(false);
  });

  it("shows a colleague with Staff access the directory only", () => {
    const a = profileAccess({ ...none, relation: "other", canViewStaff: true, canManageStaff: true });
    expect(a).toMatchObject({ directory: true, employment: false, sensitive: false, editEmployment: false, accessLog: false });
  });

  it("does not let HR edit personal details it cannot read", () => {
    expect(profileAccess({ ...none, relation: "other", canManageHr: true }).editSensitive).toBe(false);
    expect(profileAccess({ ...none, relation: "other", canManageHr: true, canViewSensitive: true }).editSensitive).toBe(true);
  });

  it("lets sensitive-view alone read personal details without editing them", () => {
    const a = profileAccess({ ...none, relation: "other", canViewSensitive: true });
    expect(a.sensitive).toBe(true);
    expect(a.editSensitive).toBe(false);
  });

  it("logs a look at personal details by anyone but the person", () => {
    expect(shouldLogSensitiveView("self")).toBe(false);
    expect(shouldLogSensitiveView("manager")).toBe(true);
    expect(shouldLogSensitiveView("other")).toBe(true);
  });
});

describe("HR permissions are never a role default", () => {
  it("leaves HR out of every role, ADMIN included", () => {
    for (const [role, ids] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const hr of HR_PERMISSION_IDS) expect(ids, `${role} has ${hr}`).not.toContain(hr);
    }
  });

  it("still grants them to one person by override, and always to a Super Admin", () => {
    const granted = resolveEffectivePermissions("STAFF", DEFAULT_ROLE_PERMISSIONS, { grant: ["hr.manage"], revoke: [] });
    expect(granted).toContain("hr.manage");
    expect(granted).not.toContain("hr.viewSensitive");
    expect(resolveEffectivePermissions("SUPER_ADMIN", DEFAULT_ROLE_PERMISSIONS, EMPTY_OVERRIDES)).toEqual(
      expect.arrayContaining([...HR_PERMISSION_IDS]),
    );
  });
});

describe("normaliseEmployment", () => {
  it("accepts a full set and changes only the keys it was given", () => {
    const r = normaliseEmployment({ noticePeriodWeeks: 4 });
    expect(r).toEqual({ ok: true, value: { noticePeriodWeeks: 4 } });
  });

  it("refuses impossible values", () => {
    expect(normaliseEmployment({ noticePeriodWeeks: -1 }).ok).toBe(false);
    expect(normaliseEmployment({ noticePeriodWeeks: 2.5 }).ok).toBe(false);
    expect(normaliseEmployment({ daysPerWeek: 0 }).ok).toBe(false);
    expect(normaliseEmployment({ daysPerWeek: 3.3 }).ok).toBe(false);
    expect(normaliseEmployment({ daysPerWeek: 8 }).ok).toBe(false);
    expect(normaliseEmployment({ endDate: "2026-02-30" }).ok).toBe(false);
  });

  it("takes half days and clears with null or blank", () => {
    expect(normaliseEmployment({ daysPerWeek: 2.5 })).toEqual({ ok: true, value: { daysPerWeek: 2.5 } });
    expect(normaliseEmployment({ endDate: "", supplierId: "" })).toEqual({ ok: true, value: { endDate: null, supplierId: null } });
  });
});

describe("NI numbers", () => {
  it("accepts spaced and lower-case input and stores it compact", () => {
    expect(normaliseNiNumber("ab 12 34 56 c")).toBe("AB123456C");
    expect(formatNiNumber("AB123456C")).toBe("AB 12 34 56 C");
  });

  it("refuses letters HMRC never issues", () => {
    expect(normaliseNiNumber("DA123456A")).toBeNull(); // D is never a first letter
    expect(normaliseNiNumber("AO123456A")).toBeNull(); // O is never a second letter
    expect(normaliseNiNumber("AB123456E")).toBeNull(); // suffix is A to D
    expect(normaliseNiNumber("AB12345C")).toBeNull();
  });
});

describe("normaliseSensitive", () => {
  it("keeps what was entered, tidied", () => {
    const r = normaliseSensitive(
      {
        dateOfBirth: "1990-06-14",
        homeAddress: "  12 Quay Street  ",
        niNumber: "ab 12 34 56 c",
        personalEmail: "ada@example.com",
        emergencyContacts: [{ name: " Ada ", relationship: "Partner", phone: "07700 900456" }],
      },
      TODAY,
    );
    expect(r.ok && r.value).toMatchObject({
      dateOfBirth: "1990-06-14",
      homeAddress: "12 Quay Street",
      niNumber: "AB123456C",
      emergencyContacts: [{ name: "Ada", relationship: "Partner", phone: "07700 900456" }],
    });
  });

  it("refuses a date of birth today or later, and a bad email or NI number", () => {
    expect(normaliseSensitive({ dateOfBirth: TODAY }, TODAY).ok).toBe(false);
    expect(normaliseSensitive({ personalEmail: "not-an-email" }, TODAY).ok).toBe(false);
    expect(normaliseSensitive({ niNumber: "123" }, TODAY).ok).toBe(false);
  });

  it("drops a blank contact row but refuses a half-filled one", () => {
    expect(normaliseSensitive({ emergencyContacts: [{ name: "", relationship: "", phone: "" }] }, TODAY)).toEqual({
      ok: true,
      value: { ...EMPTY_SENSITIVE, emergencyContacts: [] },
    });
    const half = normaliseSensitive({ emergencyContacts: [{ name: "Ada", relationship: null, phone: "" }] }, TODAY);
    expect(half.ok).toBe(false);
  });

  it("caps emergency contacts", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ name: `C${i}`, relationship: null, phone: "1" }));
    expect(normaliseSensitive({ emergencyContacts: many }, TODAY).ok).toBe(false);
  });
});

describe("parseSensitive", () => {
  it("never throws on a damaged payload", () => {
    expect(parseSensitive(null)).toEqual(EMPTY_SENSITIVE);
    expect(parseSensitive({ dateOfBirth: 12, emergencyContacts: [null, { name: "A" }, { name: "B", phone: "1" }] })).toEqual({
      ...EMPTY_SENSITIVE,
      emergencyContacts: [{ name: "B", relationship: null, phone: "1" }],
    });
  });
});

describe("changedSensitiveFields", () => {
  it("names what changed, never the values", () => {
    const after = { ...EMPTY_SENSITIVE, niNumber: "AB123456C", emergencyContacts: [{ name: "A", relationship: null, phone: "1" }] };
    const changed = changedSensitiveFields(EMPTY_SENSITIVE, after);
    expect(changed).toEqual(["NI number", "emergency contacts"]);
    expect(changed.join(" ")).not.toContain("AB123456C");
  });
});

describe("normaliseSupplier", () => {
  it("needs a name to create, not to update", () => {
    expect(normaliseSupplier({}, true).ok).toBe(false);
    expect(normaliseSupplier({ notes: "x" }, false)).toEqual({ ok: true, value: { notes: "x" } });
  });

  it("checks the contact email and renewal date", () => {
    expect(normaliseSupplier({ name: "Indus", contactEmail: "nope" }, true).ok).toBe(false);
    expect(normaliseSupplier({ name: "Indus", agreementRenewsOn: "31/12/2026" }, true).ok).toBe(false);
  });
});

describe("dateAttention", () => {
  it("flags passed and upcoming dates, and nothing far off", () => {
    expect(dateAttention("2026-10-28", TODAY)).toBe("passed");
    expect(dateAttention(TODAY, TODAY)).toBe("soon");
    expect(dateAttention("2026-11-28", TODAY)).toBe("soon");
    expect(dateAttention("2026-11-29", TODAY)).toBeNull();
    expect(dateAttention(null, TODAY)).toBeNull();
  });
});
