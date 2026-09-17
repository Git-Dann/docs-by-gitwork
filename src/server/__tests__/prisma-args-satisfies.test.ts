/**
 * Every EXTRACTED Prisma args object must carry `satisfies Prisma.<Model><Kind>`.
 *
 * ## The mechanism this defends, which is not obvious
 *
 * TypeScript's excess-property check fires only on an object literal passed **directly**
 * at the call site. Pull that literal out into a named const for readability —
 * `include: BOARD_INCLUDE` — and the check is **silently disabled**. A field that does
 * not exist then compiles clean and throws only when Prisma runs.
 *
 * That is exactly what 500'd every client's wiki in September 2026 (CLAUDE.md §50): an
 * extracted `include` ordered three child relations by `createdAt`, a column none of
 * them has.
 *
 * ⚠️ **`as const` does NOT restore the check.** It reads like a safety measure and is
 * not one — a bogus key inside an `as const` object produces zero diagnostics. This was
 * verified directly, both ways:
 *
 * ```ts
 * const A = { id: true, bogusA: true } as const;                          // no error
 * const B = { id: true, bogusB: true } as const satisfies Prisma.XSelect; // TS2353
 * ```
 *
 * `as const satisfies T` is the form that works, and both halves are load-bearing:
 * `satisfies` re-enables the excess-property check, and `as const` preserves the literal
 * `true` types that Prisma's payload inference needs (with `satisfies` alone, `true`
 * widens to `boolean` and every result degrades to `{ [x: string]: any }`).
 *
 * This test is a source-text sweep because the thing it is checking is *the presence of a
 * type annotation*, which by definition cannot be checked from inside the type system.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The arg positions whose shape Prisma validates at runtime. */
const SHAPE_KEYS = ["select", "include", "orderBy"] as const;

interface Extracted {
  file: string;
  name: string;
  guarded: boolean;
}

/**
 * Find `const NAME = { … }` / `= [ … ]` declarations that are later handed to a Prisma
 * call at a shape position (`select: NAME`, `include: NAME`, `orderBy: NAME`).
 *
 * Deliberately conservative: it only reports a const that is *demonstrably* used at one
 * of those positions in the same file. A shape assembled inline, spread, or returned
 * from a helper is a real blind spot too — see the "known gaps" note at the bottom —
 * but guessing at those produces noise, and a noisy guard gets disabled.
 */
function extractedShapes(source: string, file: string): Extracted[] {
  const found: Extracted[] = [];
  const declRe = /^(?:const|\s+const) (\w+)(?:\s*:\s*[^=]+)?\s*=\s*([{[])/gm;
  for (const m of source.matchAll(declRe)) {
    const name = m[1];
    const usedAtShapePosition = SHAPE_KEYS.some((k) =>
      new RegExp(`\\b${k}:\\s*${name}\\b`).test(source),
    );
    if (!usedAtShapePosition) continue;

    // Walk to the matching close brace/bracket so we can read the declaration's tail.
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;
    const tail = source.slice(end, source.indexOf("\n", end) + 1 || undefined);
    found.push({ file, name, guarded: /satisfies\s+Prisma\./.test(tail) });
  }
  return found;
}

describe("extracted Prisma args objects re-enable the excess-property check", () => {
  const all = walk(ROOT).flatMap((f) =>
    extractedShapes(readFileSync(f, "utf8"), path.relative(process.cwd(), f)),
  );

  it("finds the extracted shapes at all (the sweep itself works)", () => {
    // Without this, a broken matcher would report "0 unguarded" and pass forever —
    // the failure mode that makes a source-text guard worthless.
    expect(all.length).toBeGreaterThanOrEqual(15);
    expect(all.map((s) => s.name)).toContain("BOARD_INCLUDE");
    expect(all.map((s) => s.name)).toContain("WIKI_INCLUDE");
  });

  it("every one of them carries `satisfies Prisma.<Model><Kind>`", () => {
    const unguarded = all.filter((s) => !s.guarded);
    expect(
      unguarded,
      unguarded.length
        ? `These Prisma args objects are extracted into a const, which DISABLES the ` +
          `excess-property check, and are not re-guarded. Add ` +
          `\`as const satisfies Prisma.<Model>Select|Include|OrderByWithRelationInput\` ` +
          `to each:\n` +
          unguarded.map((s) => `  • ${s.name} — ${s.file}`).join("\n")
        : "",
    ).toEqual([]);
  });
});

/**
 * Known gaps, recorded so nobody reads a green run as "all Prisma field names are
 * checked":
 *
 * - **`$queryRaw` / `$executeRaw`** name columns inside SQL strings. Invisible to tsc,
 *   to `satisfies`, and to this test. ~13 sites.
 * - **Shapes built inline in a helper's return value**, or spread into a call, are not
 *   matched here — the matcher requires `select:|include:|orderBy: NAME`.
 * - **`where` and `data`** are excluded on purpose: they are routinely built from
 *   variables and conditionals, so requiring a `satisfies` tail on them would be mostly
 *   false positives. tsc already checks the common inline case for both.
 */
