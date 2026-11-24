import { describe, expect, it } from "vitest";
import { eventSentence, isUnlockPhrase, liveVersionOf, masterVersionOf, variantDrift, actorTag } from "@/lib/wiki-code-rules";

const v = (id: string, day: number, extra: Partial<{ isCurrent: boolean; isMaster: boolean; variantId: string | null }> = {}) => ({
  id,
  label: id,
  isCurrent: false,
  isMaster: false,
  variantId: null as string | null,
  createdAt: new Date(Date.UTC(2026, 10, day)).toISOString(),
  ...extra,
});

describe("isUnlockPhrase", () => {
  it("needs the words, ignoring case and spaces round them", () => {
    expect(isUnlockPhrase("Unlock Code")).toBe(true);
    expect(isUnlockPhrase("  unlock code ")).toBe(true);
    expect(isUnlockPhrase("unlock")).toBe(false);
    expect(isUnlockPhrase("Unlock  Code")).toBe(false);
    expect(isUnlockPhrase("")).toBe(false);
    expect(isUnlockPhrase(null)).toBe(false);
  });
});

describe("masterVersionOf", () => {
  it("is the version marked Master, on the Master line", () => {
    expect(masterVersionOf([v("a", 1), v("b", 2, { isMaster: true }), v("c", 3, { isCurrent: true })])?.id).toBe("b");
  });
  it("falls back to the Master line's Live, then its newest", () => {
    expect(masterVersionOf([v("a", 1, { isCurrent: true }), v("b", 2)])?.id).toBe("a");
    expect(masterVersionOf([v("a", 1), v("b", 2)])?.id).toBe("b");
  });
  it("never picks a variant's version", () => {
    expect(masterVersionOf([v("a", 1), v("x", 5, { variantId: "ivy", isCurrent: true })])?.id).toBe("a");
    expect(masterVersionOf([v("x", 5, { variantId: "ivy" })])).toBeNull();
  });
});

describe("liveVersionOf", () => {
  it("is each line's own Live", () => {
    const all = [v("a", 1, { isCurrent: true }), v("b", 2), v("x", 3, { variantId: "ivy" }), v("y", 4, { variantId: "ivy", isCurrent: true })];
    expect(liveVersionOf(all, null)?.id).toBe("a");
    expect(liveVersionOf(all, "ivy")?.id).toBe("y");
  });
});

describe("variantDrift", () => {
  const all = [v("m1", 1), v("m2", 2, { isMaster: true }), v("x", 3, { variantId: "ivy" })];
  it("is behind when Master has moved on since the copy", () => {
    expect(variantDrift({ baseVersionId: "m1", baseLabel: "m1" }, all)).toMatchObject({ behind: true, baseLabel: "m1", masterLabel: "m2", masterId: "m2" });
  });
  it("is up to date when Master is still what it was copied from", () => {
    expect(variantDrift({ baseVersionId: "m2", baseLabel: "m2" }, all).behind).toBe(false);
  });
  it("counts a deleted base as behind", () => {
    expect(variantDrift({ baseVersionId: null, baseLabel: "v0.9" }, all).behind).toBe(true);
  });
});

describe("eventSentence", () => {
  it("names the version and the variant", () => {
    expect(eventSentence({ kind: "version_uploaded", actorName: "Priya", actorIsClient: true, versionLabel: "v1.1.1", variantName: "The Ivy" })).toBe("uploaded v1.1.1 to The Ivy");
    expect(eventSentence({ kind: "version_edited", actorName: "Priya", actorIsClient: true, versionLabel: "v1.1.1", variantName: "The Ivy" })).toBe("changed v1.1.1 on The Ivy");
    expect(eventSentence({ kind: "made_master", actorName: "Tom", actorIsClient: false, versionLabel: "v1.2" })).toBe("marked v1.2 as Master");
    expect(eventSentence({ kind: "unlocked", actorName: "Priya", actorIsClient: true })).toBe("unlocked the code");
  });
  it("tags who it was", () => {
    expect(actorTag(true)).toBe("Client");
    expect(actorTag(false)).toBe("Gitwork");
  });
});
