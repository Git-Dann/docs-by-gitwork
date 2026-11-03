import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 2 (docs/multi-tenant-roadmap.md) replaces the two ways code finds "the" workspace —
 * `DEFAULT_WORKSPACE_SLUG` filters and `ensureBaseRecords().workspace` — with the workspace
 * the request belongs to. Until every site is moved, this ratchet stops NEW ones arriving:
 * the counts below may only go down.
 *
 * Removed some? Lower the number to what the test reports, in the same PR, so the gain is
 * locked in. Need to ADD one? Don't: resolve the workspace from the request (or, for a
 * cron, loop over workspaces). If there is truly no alternative yet, raise the number in a
 * PR that says why.
 */

const CEILING = {
  DEFAULT_WORKSPACE_SLUG: 113,
  ensureBaseRecords: 474,
} as const;

const root = join(__dirname, "../../../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

function count(word: keyof typeof CEILING): { total: number; files: string[] } {
  let total = 0;
  const files: string[] = [];
  for (const file of sourceFiles(join(root, "src"))) {
    const n = (readFileSync(file, "utf8").match(new RegExp(`\\b${word}\\b`, "g")) ?? []).length;
    if (n) {
      total += n;
      files.push(relative(root, file));
    }
  }
  return { total, files };
}

describe("single-workspace lookups only ever go down", () => {
  for (const word of Object.keys(CEILING) as Array<keyof typeof CEILING>) {
    it(`${word} appears no more than ${CEILING[word]} times in src`, () => {
      const { total, files } = count(word);
      // Sanity: a matcher that finds nothing would pass forever.
      expect(files.length).toBeGreaterThan(10);
      expect(
        total,
        `${word} now appears ${total} times (ceiling ${CEILING[word]}). ` +
          (total > CEILING[word]
            ? "A new single-workspace lookup was added; resolve the workspace from the request instead."
            : ""),
      ).toBeLessThanOrEqual(CEILING[word]);
    });
  }
});
