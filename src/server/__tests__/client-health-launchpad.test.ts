import { describe, it, expect } from "vitest";
import { deriveClientHealth } from "@/server/client-metrics";

/**
 * `deriveClientHealth` gained a Launchpad input. Two properties matter enough to pin,
 * and both are about the signal MEANING something rather than merely existing.
 */
describe("deriveClientHealth — the Launchpad signal", () => {
  it("stays null when there is no signal at all", () => {
    // A client with nothing to report shows nothing, rather than implying a healthy
    // empty client. Unchanged behaviour — asserted so the new branch can't break it.
    expect(deriveClientHealth({ pulseHealthScore: null, overdueTasks: 0 })).toBeNull();
    expect(
      deriveClientHealth({ pulseHealthScore: null, overdueTasks: 0, launchpadOutstanding: null }),
    ).toBeNull();
  });

  it("distinguishes 'no Launchpad' from 'nothing outstanding'", () => {
    // null = we never asked; 0 = they have given us everything. Reporting the first as
    // the second is the §35 mistake — "we could not look" becoming "it isn't there".
    expect(
      deriveClientHealth({ pulseHealthScore: null, overdueTasks: 0, launchpadOutstanding: null }),
    ).toBeNull();
    expect(
      deriveClientHealth({ pulseHealthScore: null, overdueTasks: 0, launchpadOutstanding: 0 }),
    ).toBeNull();
  });

  it("goes amber with outstanding items, and says how many", () => {
    const health = deriveClientHealth({
      pulseHealthScore: null,
      overdueTasks: 0,
      launchpadOutstanding: 3,
    });
    expect(health?.level).toBe("amber");
    expect(health?.reasons).toContain("3 Launchpad items outstanding");
  });

  it("singularises one item", () => {
    const health = deriveClientHealth({
      pulseHealthScore: null,
      overdueTasks: 0,
      launchpadOutstanding: 1,
    });
    expect(health?.reasons).toContain("1 Launchpad item outstanding");
  });

  it("NEVER goes red, however many are outstanding", () => {
    // This is the load-bearing one. Everything else in this function is a fault on
    // OUR side; Launchpad is work we are waiting on the CLIENT for. Letting it go red
    // would put a client who hasn't sent their app icons in the same bucket as one
    // whose delivery is genuinely failing, and the board would stop meaning anything.
    for (const n of [1, 5, 20, 500]) {
      const health = deriveClientHealth({
        pulseHealthScore: null,
        overdueTasks: 0,
        launchpadOutstanding: n,
      });
      expect(health?.level, `${n} outstanding`).toBe("amber");
    }
  });

  it("does not mask a genuinely red delivery signal", () => {
    // Rank still wins: an amber Launchpad must never soften a red overdue count.
    const health = deriveClientHealth({
      pulseHealthScore: null,
      overdueTasks: 8,
      launchpadOutstanding: 2,
    });
    expect(health?.level).toBe("red");
    expect(health?.reasons).toEqual(
      expect.arrayContaining(["8 overdue tasks", "2 Launchpad items outstanding"]),
    );
  });

  it("upgrades a green client to amber", () => {
    // A client passing Pulse with no overdue work is green — until they owe us
    // something, which is exactly the case this signal exists to surface.
    const green = deriveClientHealth({ pulseHealthScore: 90, overdueTasks: 0 });
    expect(green?.level).toBe("green");

    const waiting = deriveClientHealth({
      pulseHealthScore: 90,
      overdueTasks: 0,
      launchpadOutstanding: 4,
    });
    expect(waiting?.level).toBe("amber");
    expect(waiting?.reasons).toContain("4 Launchpad items outstanding");
  });

  it("ignores a negative or nonsense count rather than reporting a fake signal", () => {
    expect(
      deriveClientHealth({ pulseHealthScore: null, overdueTasks: 0, launchpadOutstanding: -1 }),
    ).toBeNull();
  });
});
