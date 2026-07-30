import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { PLATFORM_FAMILIES } from "../platform-coverage";

// ─────────────────────────────────────────────────────────────────────────────
// Guards PLATFORM_FAMILIES[*].count against the family it claims to describe.
//
// WHY THIS EXISTS. That number is QUOTED TO THE USER, in a check whose entire
// purpose is to say honestly what did and did not run:
//
//   "The 25 browser extension checks did NOT run."
//
// A hand-maintained count drifts the moment anyone adds or removes a check, and
// it drifts SILENTLY — nothing compiles differently, no other test looks at it,
// and the sentence stays perfectly plausible. It had already drifted when this
// test was written: the browser-extension family claimed 26 against 25 real
// checks, so the product was overstating its own coverage in the one message
// designed to stop exactly that.
//
// This is the same failure mode CLAUDE.md §35 records ("we could not look"
// rendering as "it is not there"), one layer out: a number nobody re-derived
// rendering as a measurement.
//
// If this fails, the family changed size. Update the count — do not relax the
// test.
// ─────────────────────────────────────────────────────────────────────────────

const CHECKS_DIR = "src/server/pulse-checks";

/**
 * Distinct checkKeys a module emits.
 *
 * Two forms, both real and both load-bearing — the second is not a stylistic
 * variant. cli-tool.ts emits its three package-metadata checks as tuples, and a
 * literal-only scan reports that family as 19 rather than 22.
 */
function emittedKeys(file: string): Set<string> {
  const src = readFileSync(join(CHECKS_DIR, file), "utf8");
  const keys = new Set<string>();
  for (const m of src.matchAll(/checkKey:\s*"([^"]+)"/g)) keys.add(m[1]);
  // Tuple form: ["check_key", "field", …]
  for (const m of src.matchAll(/\[\s*"([a-z0-9]+_[a-z0-9_]+)"\s*,\s*"[^"]*"\s*[,\]]/g)) keys.add(m[1]);
  return keys;
}

describe("platform family coverage counts", () => {
  for (const [dropdownValue, spec] of Object.entries(PLATFORM_FAMILIES)) {
    it(`${dropdownValue} claims ${spec.count} checks and its modules emit that many`, () => {
      const keys = new Set<string>();
      for (const file of spec.sourceFiles) {
        for (const key of emittedKeys(file)) keys.add(key);
      }
      expect(
        keys.size,
        `${dropdownValue} quotes "${spec.count} ${spec.label} checks" to the user, but ` +
          `${spec.sourceFiles.join(" + ")} emit ${keys.size}. Update the count in platform-coverage.ts.`,
      ).toBe(spec.count);
    });
  }

  it("every family names at least one source file", () => {
    for (const [dropdownValue, spec] of Object.entries(PLATFORM_FAMILIES)) {
      expect(spec.sourceFiles.length, `${dropdownValue} has no sourceFiles`).toBeGreaterThan(0);
    }
  });

  // A family that shares a module with another would make both counts ambiguous
  // and let a check be claimed twice in the same report.
  it("no module is claimed by two families", () => {
    const owner = new Map<string, string>();
    for (const [dropdownValue, spec] of Object.entries(PLATFORM_FAMILIES)) {
      for (const file of spec.sourceFiles) {
        expect(owner.get(file), `${file} claimed by both ${owner.get(file)} and ${dropdownValue}`).toBeUndefined();
        owner.set(file, dropdownValue);
      }
    }
  });
});
