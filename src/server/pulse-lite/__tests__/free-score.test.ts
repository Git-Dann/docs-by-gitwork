/**
 * The free scan's score errs low (Dan, Nov 2026): what it couldn't judge counts as half
 * marks, and a scan that judged too little is labelled provisional.
 */
import { describe, expect, it } from "vitest";
import { cautiousScore, freeScanScore } from "@/server/pulse-lite/free-score";
import { PROVISIONAL_BELOW, provisionalNote } from "@/lib/pulse-free-score";
import type { PulseScanCheckInput } from "@/types/pulse";

describe("cautiousScore", () => {
  it("leaves a scan that judged everything alone", () => {
    expect(cautiousScore({ finalScore: 88, lowerBound: 88, completeness: 100 })).toMatchObject({ score: 88, provisional: false });
  });

  it("⚠️ gives half marks for what it couldn't judge, so seeing less never scores higher", () => {
    // StayPay's shape: 93 from what it saw, at 69% coverage.
    const s = cautiousScore({ finalScore: 93, lowerBound: 64, completeness: 69 });
    expect(s.score).toBe(79);
    expect(s.score).toBeLessThan(93);
    expect(s.provisional).toBe(true);
    expect(s.coverage).toBe(69);
    expect(s.fromWhatItSaw).toBe(93);
  });

  it("is provisional below the floor and not at it", () => {
    expect(cautiousScore({ finalScore: 80, lowerBound: 70, completeness: PROVISIONAL_BELOW - 1 }).provisional).toBe(true);
    expect(cautiousScore({ finalScore: 80, lowerBound: 70, completeness: PROVISIONAL_BELOW }).provisional).toBe(false);
  });

  it("a blocked scan stays at 0", () => {
    expect(cautiousScore({ finalScore: 0, lowerBound: 0, completeness: 0 }).score).toBe(0);
  });
});

describe("freeScanScore over real checks", () => {
  const check = (checkKey: string, status: PulseScanCheckInput["status"]): PulseScanCheckInput =>
    ({ checkKey, label: checkKey, category: "Security", status, detail: "", severity: "MEDIUM" }) as unknown as PulseScanCheckInput;

  it("scores lower when checks couldn't be judged than when they were all passes", () => {
    const seen = freeScanScore([check("a", "PASS"), check("b", "PASS"), check("c", "PASS"), check("d", "PASS")]);
    const halfBlind = freeScanScore([check("a", "PASS"), check("b", "PASS"), check("c", "INCONCLUSIVE"), check("d", "INCONCLUSIVE")]);
    expect(seen.score).toBe(100);
    expect(halfBlind.fromWhatItSaw).toBe(100);
    expect(halfBlind.score).toBeLessThan(100);
  });
});

describe("the provisional note", () => {
  it("says how much it judged, in public copy (no 'free', no em dashes)", () => {
    const note = provisionalNote(69);
    expect(note).toContain("69%");
    expect(note.toLowerCase()).not.toContain("free");
    expect(note).not.toContain("—");
  });
});
