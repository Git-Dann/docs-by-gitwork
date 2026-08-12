import { describe, expect, it } from "vitest";
import { hasKnownSubmitter, resolveRequestedBy } from "../wiki-intake-attribution";

/**
 * Attribution precedence for a client request.
 *
 * One of the three inputs — the typed "Requested by" — is caller-controlled, and
 * anyone holding a client's wiki link can send anything in it. So the property
 * worth pinning is not the happy path but that a typed name can NEVER override an
 * identity we established ourselves: otherwise a request could be filed in a
 * colleague's name, or in ours.
 */

describe("resolveRequestedBy", () => {
  it("prefers the signed-in client user", () => {
    expect(
      resolveRequestedBy({ clientUserName: "Paps", staffName: "Dan", typedName: "Someone else" }),
    ).toBe("Paps");
  });

  it("a typed name cannot override a known identity", () => {
    // The security-relevant case.
    expect(resolveRequestedBy({ clientUserName: "Paps", typedName: "Dan Lindsay" })).toBe("Paps");
    expect(resolveRequestedBy({ staffName: "Dan", typedName: "Paps" })).toBe("Dan");
  });

  it("falls back to staff when there is no client user", () => {
    expect(resolveRequestedBy({ staffName: "dan@gitwork.co.uk", typedName: "x" })).toBe(
      "dan@gitwork.co.uk",
    );
  });

  it("uses the typed name only when nobody is signed in", () => {
    expect(resolveRequestedBy({ typedName: "Luke at Big Wedge" })).toBe("Luke at Big Wedge");
  });

  it("returns null when nothing usable is supplied, so callers apply their own default", () => {
    expect(resolveRequestedBy({})).toBeNull();
    expect(resolveRequestedBy({ clientUserName: null, staffName: undefined, typedName: "" })).toBeNull();
  });

  it("treats whitespace as absent rather than as a name", () => {
    // A blank-looking attribution is worse than none: it reads as a real answer.
    expect(resolveRequestedBy({ clientUserName: "   ", typedName: "Paps" })).toBe("Paps");
    expect(resolveRequestedBy({ typedName: "  \n\t " })).toBeNull();
  });

  it("trims the value it returns", () => {
    expect(resolveRequestedBy({ clientUserName: "  Paps  " })).toBe("Paps");
  });
});

describe("hasKnownSubmitter", () => {
  it("is true for either identity, and false for a merely typed name", () => {
    expect(hasKnownSubmitter({ clientUserName: "Paps" })).toBe(true);
    expect(hasKnownSubmitter({ staffName: "Dan" })).toBe(true);
    // A typed name must not make the UI hide the box and claim it knows who you are.
    expect(hasKnownSubmitter({ typedName: "Paps" })).toBe(false);
    expect(hasKnownSubmitter({})).toBe(false);
  });

  it("ignores whitespace-only identities", () => {
    expect(hasKnownSubmitter({ clientUserName: "  ", staffName: "\t" })).toBe(false);
  });
});
