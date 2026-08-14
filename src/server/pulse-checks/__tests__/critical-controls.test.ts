import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRITICAL_KEYS } from "../confidence";
import { computePriority } from "../priority";
import type { PulseScanCheckInput } from "@/types/pulse";

// ─────────────────────────────────────────────────────────────────────────────
// Two hand-maintained lists both meant "this control is critical" and had drifted
// in both directions. Severity (confidence.ts) drives scoring weight and the gate;
// the launch-blocking set (priority.ts) drives the ranked fix list a customer
// actually works through. A control can be in the second without the first —
// a missing privacy policy stops a launch without being dangerous — but never the
// other way round, because that means Pulse scored something at full critical
// weight and then declined to tell anyone to fix it first.
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_SOURCE = readFileSync("src/server/pulse-checks/priority.ts", "utf8");

function failing(checkKey: string, category: PulseScanCheckInput["category"]): PulseScanCheckInput {
  return {
    category,
    checkKey,
    label: checkKey,
    status: "FAIL",
    confidence: "HIGH",
    trustBucket: "CONFIRMED",
  };
}

describe("every technically-critical control is also ranked as launch-blocking", () => {
  it("ranks all of CRITICAL_KEYS at P1", () => {
    for (const key of CRITICAL_KEYS) {
      const tier = computePriority(failing(key, "Security")).tier;
      expect(tier, `${key} should rank P1`).toBe("P1");
    }
  });

  it("gives the two that were missing the same launch-blocking boost as the rest", () => {
    // ⚠️ Assert the SCORE, not the tier. Security is double-weighted, so both of these tiered
    // P1 with or without the boost — the tier was never wrong, which is why this went unnoticed
    // for so long. The defect was the order INSIDE P1: a confirmed SSRF scored 6 against a
    // missing privacy policy's 10, so the fix list put the policy page first. A tier assertion
    // here would pass with the bug fully restored and prove nothing.
    const boosted = computePriority(failing("ssl_valid", "Security")).score;
    for (const key of ["outbound_target_ssrf_safe", "auth_content_redaction"]) {
      expect(CRITICAL_KEYS.has(key)).toBe(true);
      expect(computePriority(failing(key, "Security")).score, `${key} missed the boost`).toBe(boosted);
    }
  });

  it("no longer ranks a missing policy page above a confirmed SSRF", () => {
    const ssrf = computePriority(failing("outbound_target_ssrf_safe", "Security")).score;
    const privacy = computePriority(failing("privacy_policy", "Legal & Compliance")).score;
    expect(ssrf).toBeGreaterThanOrEqual(privacy);
  });

  it("builds the ranking set FROM the severity set rather than retyping it", () => {
    // A copied literal is what let them drift. Containment must be structural, not clerical.
    expect(PRIORITY_SOURCE).toMatch(/new Set<string>\(\[\.\.\.CRITICAL_KEYS,/);
    expect(PRIORITY_SOURCE).not.toMatch(/HARD_CRITICAL = new Set\(\[\s*"ssl_valid"/);
  });
});

describe("launch-blocking is a wider idea than technically severe", () => {
  it("still ranks a missing privacy policy and terms at the top", () => {
    // These are not in CRITICAL_KEYS on purpose — they stop a launch (app stores, GDPR, and the
    // gate's blocking keys) without losing data or exposing credentials. Adding them to the
    // severity set would give a missing policy page the same scoring weight as an exposed .env.
    for (const key of ["privacy_policy", "terms_of_service"]) {
      expect(CRITICAL_KEYS.has(key)).toBe(false);
      expect(computePriority(failing(key, "Legal & Compliance")).tier).toBe("P1");
    }
  });

  it("does not promote an ordinary failing check", () => {
    expect(computePriority(failing("has_word_count", "SEO")).tier).not.toBe("P1");
  });
});
