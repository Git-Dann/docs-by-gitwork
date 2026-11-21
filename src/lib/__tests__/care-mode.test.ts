import { describe, expect, it } from "vitest";
import { careMode, ingestOnlyReason, isSupportDesk, partitionCareClients } from "@/lib/care-mode";

describe("careMode", () => {
  it("is a support desk by default — every existing client, unchanged", () => {
    expect(careMode({})).toBe("support");
    expect(careMode({ ingestOnly: false, courseRequestOnly: false })).toBe("support");
    expect(isSupportDesk({})).toBe(true);
  });

  it("treats courseRequestOnly as ingest-only, so no row has to be migrated", () => {
    // Wedge is `courseRequestOnly` today and nothing sets `ingestOnly` on it until someone does.
    expect(careMode({ courseRequestOnly: true })).toBe("ingest_only");
    expect(isSupportDesk({ courseRequestOnly: true })).toBe(false);
  });

  it("takes the general flag on its own, for a client with no wiki pipeline", () => {
    expect(careMode({ ingestOnly: true })).toBe("ingest_only");
  });

  it("tolerates nulls from a narrowed select", () => {
    expect(careMode({ ingestOnly: null, courseRequestOnly: null })).toBe("support");
  });
});

describe("partitionCareClients", () => {
  it("splits in one pass and keeps the order it was given", () => {
    const { desk, ingestOnly } = partitionCareClients([
      { id: "a" },
      { id: "wedge", courseRequestOnly: true },
      { id: "b" },
      { id: "c", ingestOnly: true },
    ] as Array<{ id: string; ingestOnly?: boolean; courseRequestOnly?: boolean }>);
    expect(desk.map((c) => c.id)).toEqual(["a", "b"]);
    expect(ingestOnly.map((c) => c.id)).toEqual(["wedge", "c"]);
  });

  it("handles an empty list", () => {
    expect(partitionCareClients([])).toEqual({ desk: [], ingestOnly: [] });
  });
});

describe("ingestOnlyReason", () => {
  it("names the course-request pipeline when that is what it is", () => {
    expect(ingestOnlyReason({ courseRequestOnly: true })).toMatch(/course requests/i);
  });

  it("falls back to the general wording", () => {
    expect(ingestOnlyReason({ ingestOnly: true })).toMatch(/not a support desk/i);
  });

  it("never claims nothing is waiting without saying why", () => {
    for (const c of [{ ingestOnly: true }, { courseRequestOnly: true }]) {
      expect(ingestOnlyReason(c).length).toBeGreaterThan(40);
    }
  });
});
