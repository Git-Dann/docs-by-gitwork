import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKS_REGISTRY } from "../../checks-registry";
import { CATALOGUE_VERSION, RETIRED_CHECKS, isRetiredCheck } from "../catalogue-compat";
import { STANDARDS_VALIDATION_REGISTRY } from "../standards-verification";
import { SERVICE_DEPTH_REGISTRY } from "../service-depth";
import { OPERATIONAL_DEPTH_REGISTRY } from "../operational-depth";
import baseline from "../catalogue-baseline.json";

// ─────────────────────────────────────────────────────────────────────────────
// The reconciliation `categories.reconcile.test.ts` does not do.
//
// That test guards ONE direction — every key a module emits is catalogued — which
// catches "you added a check and forgot to register it". It cannot catch the two
// failures that damage stored data:
//
//   • a registered key with no implementation behind it (advertised in the
//     Settings panel and the framework counts, emitted by nothing, so it reads as
//     a control Pulse performs and silently never does)
//   • a key that DISAPPEARS — deleted or renamed — which orphans every
//     PulseCheckConfig row a workspace has set on it and makes the corresponding
//     rows in stored scans unreadable
//
// A checkKey is a public identifier. Retiring one is allowed; losing one is not.
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH = "Run `npm run pulse:catalogue` to refresh the baseline.";

const registeredKeys = CHECKS_REGISTRY.map((definition) => definition.key);
const registered = new Set(registeredKeys);
const baselineKeys: string[] = baseline.keys;

/** Every .ts under a directory, recursively, excluding tests. */
function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : tsFilesUnder(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

/**
 * Keys a check module could actually produce.
 *
 * Deliberately broad — ANY quoted string literal in the scan tree counts, plus the
 * three registries whose keys are generated rather than written out. A narrow,
 * syntax-aware matcher was tried first and reported 42 live keys as orphans purely
 * because they are emitted from 4-tuples, default parameter values and lookup
 * tables rather than a `checkKey:` property. The question worth asking is
 * "does anything at all know this key?", not "is it emitted in the shape I expected".
 */
function implementedKeys(): Set<string> {
  const roots = ["src/server/pulse-checks", "src/server/pulse-agents"];
  const files = [
    ...roots.flatMap(tsFilesUnder),
    "src/server/pulse-scan.ts",
    "src/server/pulse-lite/run-lite-scan.ts",
  ].filter((file) => !file.endsWith("catalogue-compat.ts"));

  const keys = new Set<string>();
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(/["'`]([^"'`\n]{3,80})["'`]/g)) {
      keys.add(match[1]);
    }
  }
  const keyOf = (row: { key?: string; checkKey?: string }) => row.key ?? row.checkKey;
  for (const row of STANDARDS_VALIDATION_REGISTRY) { const key = keyOf(row); if (key) keys.add(key); }
  for (const row of SERVICE_DEPTH_REGISTRY) { const key = keyOf(row); if (key) keys.add(key); }
  for (const row of OPERATIONAL_DEPTH_REGISTRY) { const key = keyOf(row); if (key) keys.add(key); }
  return keys;
}

describe("registered checks are backed by something", () => {
  it("has no catalogued key that nothing in the scan tree knows about", () => {
    const known = implementedKeys();
    const orphans = registeredKeys.filter((key) => !known.has(key) && !isRetiredCheck(key)).sort();
    expect(
      orphans,
      `these keys are in checks-registry.ts but no check module, agent or generated registry references them. ` +
        `They are advertised in Settings → Checks and in the framework counts as controls Pulse performs. ` +
        `Either implement them, or retire them via RETIRED_CHECKS in catalogue-compat.ts: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the catalogue free of duplicate identifiers", () => {
    expect(new Set(registeredKeys).size).toBe(registeredKeys.length);
  });
});

describe("no check key is ever silently lost", () => {
  it("still registers, or explicitly retires, every key in the baseline", () => {
    const lost = baselineKeys
      .filter((key) => !registered.has(key) && !isRetiredCheck(key))
      .sort();
    expect(
      lost,
      `these check keys were removed from the registry with no RETIRED_CHECKS entry. ` +
        `Stored PulseScanCheck rows and per-workspace PulseCheckConfig rows still reference them, so ` +
        `dropping them orphans a customer's configuration and makes their scan history unreadable. ` +
        `Add a RETIRED_CHECKS entry naming the successor, then ${REFRESH}: ${lost.join(", ")}`,
    ).toEqual([]);
  });

  it("has a baseline that covers every registered key", () => {
    const unrecorded = registeredKeys.filter((key) => !baselineKeys.includes(key)).sort();
    expect(
      unrecorded,
      `these keys are registered but absent from catalogue-baseline.json, so nothing would notice ` +
        `if they were removed again. ${REFRESH} (${unrecorded.length} key(s): ${unrecorded.slice(0, 12).join(", ")})`,
    ).toEqual([]);
  });

  it("records the catalogue version the baseline was generated at", () => {
    expect(baseline.catalogueVersion).toBe(CATALOGUE_VERSION);
  });

  it("keeps the baseline's own totals honest", () => {
    expect(baseline.totals.keys).toBe(baselineKeys.length);
    expect(baseline.totals.registered).toBe(registeredKeys.length);
    expect(baseline.totals.retired).toBe(Object.keys(RETIRED_CHECKS).length);
  });
});

describe("retirement metadata is usable by someone reading an old scan", () => {
  it("does not retire a key that is still registered", () => {
    const contradictory = Object.keys(RETIRED_CHECKS).filter((key) => registered.has(key));
    expect(contradictory, "a key cannot be both live and retired").toEqual([]);
  });

  it("names a live successor for every relationship that implies one", () => {
    for (const [key, retirement] of Object.entries(RETIRED_CHECKS)) {
      if (retirement.relationship === "WITHDRAWN") {
        // A withdrawn control was not moved — there is nothing to point at.
        continue;
      }
      expect(retirement.replacedBy?.length, `"${key}" (${retirement.relationship}) must name its successor`).toBeGreaterThan(0);
      for (const successor of retirement.replacedBy ?? []) {
        expect(
          registered.has(successor) || isRetiredCheck(successor),
          `"${key}" points at "${successor}", which is neither registered nor itself retired`,
        ).toBe(true);
      }
    }
  });

  it("cannot describe a key as its own successor", () => {
    for (const [key, retirement] of Object.entries(RETIRED_CHECKS)) {
      expect(retirement.replacedBy ?? [], `"${key}" replaces itself`).not.toContain(key);
    }
  });

  it("states a reason and a retirement version for every retired key", () => {
    for (const [key, retirement] of Object.entries(RETIRED_CHECKS)) {
      expect(retirement.reason.length, `"${key}" needs a reason a reader can act on`).toBeGreaterThan(10);
      expect(retirement.retiredIn, `"${key}" needs the catalogue version it was retired in`).toBeTruthy();
    }
  });
});
