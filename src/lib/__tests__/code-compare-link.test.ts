/**
 * The shareable compare link. It must never disturb section routing: the internal wiki
 * routes on an exact `#<section>` hash and the client's share page on `?section=`.
 */
import { describe, expect, it } from "vitest";
import { compareLink, encodeComparePair, parseComparePair, withoutComparePair } from "../code-compare-link";

const pair = { moduleId: "cm1", fromId: "cv1a", toId: "cv1b" };

describe("compare pair", () => {
  it("round-trips", () => {
    expect(parseComparePair(encodeComparePair(pair))).toEqual(pair);
  });

  it("refuses anything malformed rather than guessing", () => {
    for (const bad of [null, "", "cm1", "cm1:cv1a", "cm1:cv1a..", "cm1:cv1a..cv1a", "cm1:<x>..cv1b", "cm1:a..b c"]) {
      expect(parseComparePair(bad), String(bad)).toBeNull();
    }
  });
});

describe("compareLink", () => {
  it("on the team's wiki: the section stays exactly #code-handover", () => {
    const url = new URL(compareLink("https://foundry.gitwork.co.uk/app/portal/pollen/wiki#dashboard", pair, "internal"));
    expect(url.hash).toBe("#code-handover");
    expect(url.searchParams.get("compare")).toBe("cm1:cv1a..cv1b");
    expect(url.searchParams.has("section")).toBe(false);
  });

  it("on the client's share page: opens the section with ?section= and keeps the token path", () => {
    const url = new URL(compareLink("https://foundry.gitwork.co.uk/wiki/pollen/tok123?x=1", pair, "public"));
    expect(url.pathname).toBe("/wiki/pollen/tok123");
    expect(url.searchParams.get("section")).toBe("code-handover");
    expect(url.searchParams.get("x")).toBe("1");
  });

  it("closing the dialog removes only the compare parameter", () => {
    const after = new URL(withoutComparePair("https://x.test/wiki/a/t?section=code-handover&compare=cm1:a..b#code-handover"));
    expect(after.searchParams.has("compare")).toBe(false);
    expect(after.searchParams.get("section")).toBe("code-handover");
    expect(after.hash).toBe("#code-handover");
  });
});
