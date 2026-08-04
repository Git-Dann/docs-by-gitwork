import { describe, expect, it } from "vitest";
import {
  ownerDisplayName,
  resolveDocumentOwnerName,
  templateOwnerName,
} from "@/lib/document-owner";

// `metadata.owner` is the "Prepared by" line on a document's cover. Its DEFAULT must be the
// person who created the document — the bug these tests lock down is a creation path reading
// the bootstrap/default workspace owner instead of the authenticated caller.
describe("ownerDisplayName", () => {
  it("prefers the user's name", () => {
    expect(ownerDisplayName({ name: "Dan Lindsay", email: "dan@gitwork.co.uk" })).toBe(
      "Dan Lindsay",
    );
  });

  it("falls back to the email local-part when the name is missing or blank", () => {
    expect(ownerDisplayName({ name: null, email: "harry@gitwork.co.uk" })).toBe("harry");
    expect(ownerDisplayName({ name: "   ", email: "sian@gitwork.co.uk" })).toBe("sian");
  });

  it("trims a padded name rather than treating it as present-but-ugly", () => {
    expect(ownerDisplayName({ name: "  Dan Lindsay  " })).toBe("Dan Lindsay");
  });

  it("returns null when the identity cannot be named at all", () => {
    expect(ownerDisplayName(null)).toBeNull();
    expect(ownerDisplayName(undefined)).toBeNull();
    expect(ownerDisplayName({})).toBeNull();
    expect(ownerDisplayName({ name: null, email: null })).toBeNull();
    expect(ownerDisplayName({ email: "@nope" })).toBeNull();
  });
});

describe("resolveDocumentOwnerName", () => {
  it("defaults a new document to the authenticated caller, not the workspace owner", () => {
    expect(
      resolveDocumentOwnerName({ name: "Harry Ward", email: "harry@gitwork.co.uk" }, "Dan Lindsay"),
    ).toBe("Harry Ward");
  });

  it("uses the caller's email local-part before any fallback", () => {
    expect(resolveDocumentOwnerName({ email: "syed@gitwork.co.uk" }, "Dan Lindsay")).toBe("syed");
  });

  // Requirement: a template/blueprint-supplied owner must never beat a real logged-in user.
  it("lets the caller win over a template-supplied owner", () => {
    expect(
      resolveDocumentOwnerName({ name: "Harry Ward" }, "Gitwork Delivery Team", "Dan Lindsay"),
    ).toBe("Harry Ward");
  });

  it("falls back in order when there is no per-user identity (API-key caller)", () => {
    expect(resolveDocumentOwnerName(null, "Gitwork Delivery Team", "Dan Lindsay")).toBe(
      "Gitwork Delivery Team",
    );
    expect(resolveDocumentOwnerName(null, null, "Dan Lindsay")).toBe("Dan Lindsay");
    expect(resolveDocumentOwnerName(null, "   ", "Dan Lindsay")).toBe("Dan Lindsay");
  });

  it("returns an empty string rather than a wrong name when nothing resolves", () => {
    expect(resolveDocumentOwnerName(null)).toBe("");
    expect(resolveDocumentOwnerName({}, null, undefined)).toBe("");
  });
});

describe("templateOwnerName", () => {
  it("reads owner, then preparedBy, from loose template metadata", () => {
    expect(templateOwnerName({ owner: "Gitwork Delivery Team" })).toBe("Gitwork Delivery Team");
    expect(templateOwnerName({ preparedBy: "Gitwork Delivery Team" })).toBe(
      "Gitwork Delivery Team",
    );
    expect(templateOwnerName({ owner: "  ", preparedBy: "Fallback Team" })).toBe("Fallback Team");
  });

  it("is null-safe against every non-object shape Json can hold", () => {
    expect(templateOwnerName(null)).toBeNull();
    expect(templateOwnerName(undefined)).toBeNull();
    expect(templateOwnerName("Dan")).toBeNull();
    expect(templateOwnerName(42)).toBeNull();
    expect(templateOwnerName([{ owner: "Dan" }])).toBeNull();
    expect(templateOwnerName({ owner: 7 })).toBeNull();
    expect(templateOwnerName({})).toBeNull();
  });
});
