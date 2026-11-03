/** HR document rules (src/lib/hr-documents.ts): who sees and adds what, and what counts as on file. */
import { describe, expect, it } from "vitest";
import {
  canSeeDocument,
  canUploadType,
  DEFAULT_HR_DOCUMENT_SETTINGS,
  normaliseDocumentMeta,
  outstandingRequired,
  parseHrDocumentSettings,
  requirementState,
  requiredFor,
  safeDriveLink,
} from "@/lib/hr-documents";

const TODAY = "2026-10-30";
const doc = (over: Partial<{ type: string; status: string; expiresOn: string | null }> = {}) => ({
  type: "NDA",
  status: "ON_FILE",
  expiresOn: null,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("canSeeDocument", () => {
  it("never shows a colleague anyone's documents, whatever they hold", () => {
    expect(canSeeDocument({ relation: "other", canManageHr: false, visibility: "PERSON_HR" })).toBe(false);
    expect(canSeeDocument({ relation: "other", canManageHr: false, visibility: "MANAGER" })).toBe(false);
  });

  it("shows a manager only what's marked for the manager", () => {
    expect(canSeeDocument({ relation: "manager", canManageHr: false, visibility: "MANAGER" })).toBe(true);
    expect(canSeeDocument({ relation: "manager", canManageHr: false, visibility: "PERSON_HR" })).toBe(false);
  });

  it("hides HR-only documents from the person, and shows HR everything", () => {
    expect(canSeeDocument({ relation: "self", canManageHr: false, visibility: "HR_ONLY" })).toBe(false);
    expect(canSeeDocument({ relation: "self", canManageHr: false, visibility: "PERSON_HR" })).toBe(true);
    expect(canSeeDocument({ relation: "other", canManageHr: true, visibility: "HR_ONLY" })).toBe(true);
  });
});

describe("canUploadType", () => {
  const settings = { ...DEFAULT_HR_DOCUMENT_SETTINGS, selfUploadTypes: ["PHOTO_ID" as const] };
  it("lets the person add only what HR allows or asked for", () => {
    const base = { relation: "self" as const, canManageHr: false, settings, openRequestTypes: [] as string[] };
    expect(canUploadType({ ...base, type: "PHOTO_ID" })).toBe(true);
    expect(canUploadType({ ...base, type: "CONTRACT" })).toBe(false);
    expect(canUploadType({ ...base, type: "CONTRACT", openRequestTypes: ["CONTRACT"] })).toBe(true);
  });

  it("never lets anyone add to someone else's record but HR", () => {
    expect(canUploadType({ relation: "manager", canManageHr: false, settings, openRequestTypes: [], type: "PHOTO_ID" })).toBe(false);
    expect(canUploadType({ relation: "other", canManageHr: true, settings, openRequestTypes: [], type: "CONTRACT" })).toBe(true);
  });
});

describe("requirementState", () => {
  it("counts a valid document as on file and warns 30 days before expiry", () => {
    expect(requirementState([doc()], TODAY)).toBe("on-file");
    expect(requirementState([doc({ expiresOn: "2026-11-20" })], TODAY)).toBe("expiring");
    expect(requirementState([doc({ expiresOn: "2026-10-29" })], TODAY)).toBe("expired");
  });

  it("lets the best document win", () => {
    expect(requirementState([doc({ status: "REJECTED" }), doc({ status: "TO_CHECK" })], TODAY)).toBe("to-check");
    expect(requirementState([doc({ expiresOn: "2026-10-01" }), doc({ expiresOn: "2027-10-01" })], TODAY)).toBe("on-file");
    expect(requirementState([], TODAY)).toBe("missing");
  });

  it("doesn't count an upload waiting to be checked as on file", () => {
    expect(outstandingRequired("CONTRACTOR", [doc({ type: "NDA", status: "TO_CHECK" }), doc({ type: "PHOTO_ID" })], TODAY)).toEqual(["NDA"]);
  });

  it("asks contractors for an NDA and ID, never a contract (that's on the supplier)", () => {
    expect(requiredFor("CONTRACTOR")).toEqual(["NDA", "PHOTO_ID"]);
    expect(requiredFor(null)).toEqual([]);
  });
});

describe("validation", () => {
  it("names a document after its type when no title is given", () => {
    expect(normaliseDocumentMeta({ type: "NDA" })).toEqual({ ok: true, value: { type: "NDA", title: "NDA", expiresOn: null, visibility: "PERSON_HR" } });
    expect(normaliseDocumentMeta({ type: "MADE_UP" }).ok).toBe(false);
    expect(normaliseDocumentMeta({ type: "NDA", expiresOn: "2026-02-30" }).ok).toBe(false);
  });

  it("accepts only https Drive and Docs links", () => {
    expect(safeDriveLink("https://drive.google.com/file/d/x/view")).toBe("https://drive.google.com/file/d/x/view");
    expect(safeDriveLink("javascript:alert(1)")).toBeNull();
    expect(safeDriveLink("http://drive.google.com/x")).toBeNull();
    expect(safeDriveLink("https://drive.google.com.evil.example/x")).toBeNull();
  });

  it("reads stored settings defensively", () => {
    expect(parseHrDocumentSettings({ selfUploadTypes: ["NDA", "NOPE", "NDA"], driveEnabled: "yes" })).toEqual({ selfUploadTypes: ["NDA"], driveEnabled: false });
    expect(parseHrDocumentSettings(null)).toEqual(DEFAULT_HR_DOCUMENT_SETTINGS);
  });
});
