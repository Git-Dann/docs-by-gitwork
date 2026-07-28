import { describe, it, expect } from "vitest";
import { computePriority, rankFindings } from "../priority";
import { CATEGORIES } from "../categories";
import type { PulseScanCheckInput } from "@/types/pulse";

// Tidiness findings are damped (the mirror of HARD_CRITICAL) so that adding a batch
// of nice-to-haves can never push a real finding down the "fix this first" list.

const check = (
  checkKey: string,
  status: PulseScanCheckInput["status"],
  category: PulseScanCheckInput["category"] = CATEGORIES.CODE_QUALITY,
): PulseScanCheckInput => ({
  category,
  checkKey,
  label: checkKey,
  status,
  confidence: "HIGH",
  trustBucket: status === "PASS" ? "VERIFIED_WORKING" : "CONFIRMED",
});

describe("computePriority — cosmetic damping", () => {
  it("keeps tidiness findings out of P1 and P2", () => {
    for (const key of [
      "ios_invalid_plist_keys",
      "ios_ats_exception_noop",
      "ios_dev_leftovers",
      "ios_todo_density",
      "ios_dead_code",
      "ios_committed_junk",
    ]) {
      expect(computePriority(check(key, "WARN")).tier, `${key} should be P3`).toBe("P3");
    }
  });

  it("ranks a damped finding below an ordinary one of the same status", () => {
    const cosmetic = computePriority(check("ios_dev_leftovers", "WARN"));
    const ordinary = computePriority(check("ios_request_timeout", "WARN"));
    expect(cosmetic.score).toBeLessThan(ordinary.score);
  });

  it("does not damp the security findings", () => {
    // A credential-logging FAIL in a weighted category must stay top of the list.
    const critical = computePriority(check("ios_sensitive_payload_logging", "FAIL", CATEGORIES.SECURITY));
    expect(critical.tier).toBe("P1");
  });

  it("sorts a mixed finding set with the real problems first", () => {
    const ranked = rankFindings([
      check("ios_dead_code", "WARN"),
      check("ios_invalid_plist_keys", "WARN", CATEGORIES.APP_STORE),
      check("ios_sensitive_payload_logging", "FAIL", CATEGORIES.SECURITY),
      check("ios_token_storage", "FAIL", CATEGORIES.SECRETS_KEYS),
    ]);
    expect(ranked[0].check.checkKey).toBe("ios_sensitive_payload_logging");

    // The two cosmetics score identically, so their order relative to each other is
    // an arbitrary tie-break — assert the property that matters instead: every
    // tidiness finding ranks below every real one.
    const cosmetics = ["ios_dead_code", "ios_invalid_plist_keys"];
    const worstReal = Math.min(
      ...ranked.filter((r) => !cosmetics.includes(r.check.checkKey)).map((r) => r.priority.score),
    );
    const bestCosmetic = Math.max(
      ...ranked.filter((r) => cosmetics.includes(r.check.checkKey)).map((r) => r.priority.score),
    );
    expect(bestCosmetic).toBeLessThan(worstReal);
    expect(ranked.slice(-2).map((r) => r.check.checkKey).sort()).toEqual([...cosmetics].sort());
  });

  it("still excludes passing and skipped checks from the priority list", () => {
    expect(computePriority(check("ios_dead_code", "PASS")).tier).toBeNull();
    expect(computePriority(check("ios_dead_code", "SKIPPED")).tier).toBeNull();
  });
});
