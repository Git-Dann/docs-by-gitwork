import { describe, expect, it } from "vitest";
import { STAFF_TOUR_KEY, markTourSeen, readTourSeen, shouldAutoOpenStaffTour } from "@/lib/staff-tour";

const base = { canManageHr: true, archived: false, hasPeople: true, seen: false };

describe("shouldAutoOpenStaffTour", () => {
  it("opens once for HR on the active list with people to point at", () => {
    expect(shouldAutoOpenStaffTour(base)).toBe(true);
  });
  it("never for someone without HR access, on Archived, before the team loads, or twice", () => {
    expect(shouldAutoOpenStaffTour({ ...base, canManageHr: false })).toBe(false);
    expect(shouldAutoOpenStaffTour({ ...base, archived: true })).toBe(false);
    expect(shouldAutoOpenStaffTour({ ...base, hasPeople: false })).toBe(false);
    expect(shouldAutoOpenStaffTour({ ...base, seen: true })).toBe(false);
  });
});

describe("seen, per browser", () => {
  it("round-trips through storage", () => {
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(readTourSeen(storage)).toBe(false);
    markTourSeen(storage);
    expect(m.get(STAFF_TOUR_KEY)).toBe("1");
    expect(readTourSeen(storage)).toBe(true);
  });
  it("treats unreadable storage as seen, so a blocked browser isn't shown it on every visit", () => {
    expect(readTourSeen(null)).toBe(true);
    expect(readTourSeen({ getItem: () => { throw new Error("blocked"); } })).toBe(true);
    expect(() => markTourSeen({ setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
