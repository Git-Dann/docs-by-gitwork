import { describe, it, expect } from "vitest";
import { decideStarterTransition, type StarterLifecycleInput } from "../starters-pass";
import { classifyCheck } from "../checks-pass";
import { resolveCuratorConfig } from "../config";
import { CURATOR_DEFAULTS } from "../types";

const CONFIG = CURATOR_DEFAULTS; // stale 30d, archive 90d
const NOW = new Date("2026-07-15T00:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

function starter(overrides: Partial<StarterLifecycleInput>): StarterLifecycleInput {
  return {
    id: "s1",
    name: "Test",
    isDefault: false,
    pinned: false,
    curatorState: "ACTIVE",
    lastUsedAt: null,
    createdAt: daysAgo(1),
    ...overrides,
  };
}

describe("decideStarterTransition", () => {
  it("keeps a recently-used starter ACTIVE", () => {
    expect(decideStarterTransition(starter({ lastUsedAt: daysAgo(5) }), CONFIG, NOW)).toBeNull();
  });

  it("marks an ACTIVE starter STALE after staleAfterDays", () => {
    const d = decideStarterTransition(starter({ lastUsedAt: daysAgo(40) }), CONFIG, NOW);
    expect(d).toEqual({ to: "STALE", kind: "starter_stale" });
  });

  it("archives directly when idle past archiveAfterDays", () => {
    const d = decideStarterTransition(starter({ curatorState: "STALE", lastUsedAt: daysAgo(100) }), CONFIG, NOW);
    expect(d).toEqual({ to: "ARCHIVED", kind: "starter_archive" });
  });

  it("archives an ACTIVE starter that jumped straight past the archive threshold", () => {
    const d = decideStarterTransition(starter({ lastUsedAt: daysAgo(120) }), CONFIG, NOW);
    expect(d).toEqual({ to: "ARCHIVED", kind: "starter_archive" });
  });

  it("does not re-stale an already-STALE starter still within the archive window", () => {
    expect(decideStarterTransition(starter({ curatorState: "STALE", lastUsedAt: daysAgo(40) }), CONFIG, NOW)).toBeNull();
  });

  it("falls back to createdAt when never used", () => {
    expect(decideStarterTransition(starter({ createdAt: daysAgo(45) }), CONFIG, NOW)).toEqual({
      to: "STALE",
      kind: "starter_stale",
    });
  });

  it("never touches pinned starters", () => {
    expect(decideStarterTransition(starter({ pinned: true, lastUsedAt: daysAgo(200) }), CONFIG, NOW)).toBeNull();
  });

  it("never touches built-ins", () => {
    expect(decideStarterTransition(starter({ isDefault: true, lastUsedAt: daysAgo(200) }), CONFIG, NOW)).toBeNull();
  });

  it("never re-processes an ARCHIVED starter", () => {
    expect(decideStarterTransition(starter({ curatorState: "ARCHIVED", lastUsedAt: daysAgo(200) }), CONFIG, NOW)).toBeNull();
  });
});

describe("classifyCheck", () => {
  const zero = { passCount: 0, warnCount: 0, failCount: 0, skipCount: 0 };

  it("flags a registered check with no rows at all as dead", () => {
    expect(classifyCheck(zero, true)).toBe("dead");
  });

  it("does NOT flag an only-ever-skipped check (legitimate filtering)", () => {
    expect(classifyCheck({ ...zero, skipCount: 20 }, true)).toBeNull();
  });

  it("ignores unregistered (custom) keys", () => {
    expect(classifyCheck(zero, false)).toBeNull();
  });

  it("flags always_pass when 100% PASS over enough fires", () => {
    expect(classifyCheck({ ...zero, passCount: 10 }, true)).toBe("always_pass");
  });

  it("flags noisy when 100% FAIL over enough fires", () => {
    expect(classifyCheck({ ...zero, failCount: 8 }, true)).toBe("noisy");
  });

  it("does not flag a useful mixed check", () => {
    expect(classifyCheck({ ...zero, passCount: 6, failCount: 4 }, true)).toBeNull();
  });

  it("does not flag below the minimum-fires threshold", () => {
    expect(classifyCheck({ ...zero, passCount: 3 }, true)).toBeNull();
  });
});

describe("resolveCuratorConfig", () => {
  it("returns defaults for null/garbage", () => {
    expect(resolveCuratorConfig(null)).toEqual(CURATOR_DEFAULTS);
    expect(resolveCuratorConfig("nope")).toEqual(CURATOR_DEFAULTS);
  });

  it("merges valid overrides and rejects bad values", () => {
    const c = resolveCuratorConfig({ staleAfterDays: 14, archiveAfterDays: -5, consolidate: true });
    expect(c.staleAfterDays).toBe(14);
    expect(c.archiveAfterDays).toBe(CURATOR_DEFAULTS.archiveAfterDays); // -5 rejected
    expect(c.consolidate).toBe(true);
    expect(c.intervalDays).toBe(7);
  });
});
