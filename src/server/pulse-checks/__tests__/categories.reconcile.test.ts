import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  CATEGORY_META,
  DOMAIN_DEFS,
  ORDERED_CATEGORIES,
  WEIGHTED_CATEGORIES,
  isCheckCategory,
  type CheckCategory,
} from "../categories";
import { CHECKS_REGISTRY } from "../../checks-registry";

// ─────────────────────────────────────────────────────────────────────────────
// Guards the "single source of truth" for Pulse check categories. If any of these
// fail, the category system has drifted — fix the source, not the test.
//
//   • Every CATEGORIES value has metadata + lives in exactly one report domain.
//   • Every registry row uses a real category; no duplicate keys.
//   • Every checkKey a scan module actually EMITS is catalogued in the registry
//     (so it shows in the Settings panel + framework counts). This is the drift
//     catcher: add a check without registering it and this test fails.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = Object.values(CATEGORIES) as CheckCategory[];

/**
 * Every .ts file under a directory, recursively, excluding tests.
 *
 * Recursive on purpose: this used to read only the top level, so a check module in a
 * subdirectory emitted keys that the registry guard below could never see — the drift
 * this whole test exists to catch would have gone unnoticed.
 */
function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : tsFilesUnder(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

/** Scan every check module's source for the checkKey string literals it emits. */
function emittedCheckKeys(): Set<string> {
  const roots = ["src/server/pulse-checks", "src/server/pulse-agents"];
  const files = [...roots.flatMap(tsFilesUnder), "src/server/pulse-scan.ts"];
  const keys = new Set<string>();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/checkKey:\s*"([^"]+)"/g)) keys.add(m[1]);
    // skipAllChecks / failedChecks 3-tuples: ["Category", "check_key", "label"]
    for (const m of src.matchAll(/\[\s*"[^"]+"\s*,\s*"([a-z0-9_]+)"\s*,\s*"[^"]+"\s*\]/g)) keys.add(m[1]);
    // Catalogue form: ["check_key", "Label"]. Families that must emit the same key
    // set whether or not they found evidence (CI, containers, the extended mobile
    // families) drive both paths from one table, so their keys never appear as a
    // `checkKey:` literal. Without this line the drift guard cannot see them at all.
    for (const m of src.matchAll(/\[\s*"([a-z0-9]+_[a-z0-9_]+)"\s*,\s*"[^"]{4,}"\s*\]/g)) keys.add(m[1]);
  }
  return keys;
}

describe("category metadata", () => {
  it("every CATEGORIES value has exactly one CATEGORY_META row", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_META.filter((m) => m.name === cat), `meta for "${cat}"`).toHaveLength(1);
    }
    expect(CATEGORY_META).toHaveLength(ALL_CATEGORIES.length);
  });

  it("every category belongs to exactly one report domain", () => {
    for (const cat of ALL_CATEGORIES) {
      const domains = DOMAIN_DEFS.filter((d) => d.categories.includes(cat));
      expect(domains, `"${cat}" should be in exactly one domain`).toHaveLength(1);
    }
  });

  it("ORDERED_CATEGORIES + DOMAIN_DEFS cover the whole set", () => {
    expect(new Set(ORDERED_CATEGORIES)).toEqual(new Set(ALL_CATEGORIES));
    expect(new Set(DOMAIN_DEFS.flatMap((d) => d.categories))).toEqual(new Set(ALL_CATEGORIES));
  });

  it("weighted categories are all real categories", () => {
    for (const cat of WEIGHTED_CATEGORIES) expect(isCheckCategory(cat), `"${cat}"`).toBe(true);
  });
});

describe("registry ↔ categories", () => {
  it("every registry row uses a registered category", () => {
    for (const def of CHECKS_REGISTRY) {
      expect(isCheckCategory(def.category), `check "${def.key}" → "${def.category}"`).toBe(true);
    }
  });

  it("has no duplicate check keys", () => {
    const seen = new Map<string, number>();
    for (const def of CHECKS_REGISTRY) seen.set(def.key, (seen.get(def.key) ?? 0) + 1);
    const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(dups, "duplicate keys").toEqual([]);
  });

  it("every category has at least one catalogued check", () => {
    for (const cat of ALL_CATEGORIES) {
      const n = CHECKS_REGISTRY.filter((c) => c.category === cat).length;
      expect(n, `"${cat}" has no checks in the registry`).toBeGreaterThan(0);
    }
  });
});

describe("no drift — emitted checks are catalogued", () => {
  it("every checkKey a module emits is in the registry", () => {
    const registered = new Set(CHECKS_REGISTRY.map((c) => c.key));
    const emitted = emittedCheckKeys();
    const missing = [...emitted].filter((k) => !registered.has(k)).sort();
    expect(missing, `these emitted checkKeys aren't in checks-registry.ts — add them: ${missing.join(", ")}`).toEqual([]);
  });
});
