/**
 * Every field named in a Prisma `select`/`orderBy` inside `wiki-insights.ts` must actually
 * exist on the model it refers to.
 *
 * ## Why this test has to exist
 *
 * This shipped and 500'd every client's wiki in production:
 *
 * ```ts
 * const BOARD_INCLUDE = {
 *   seriesPoints: { orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }] },
 *   …
 * };
 * ```
 *
 * `WikiInsightSeriesPoint` has no `createdAt`. Prisma threw *"Unknown argument
 * `createdAt`"*, `loadWikiInsights` rejected, and because it ran inside `buildDTO`'s
 * `Promise.all` the whole wiki DTO rejected with it — so clients who had never enabled
 * Insights lost their wiki too.
 *
 * ⚠️ **`tsc` structurally cannot catch this.** TypeScript's excess-property check fires
 * only on an object literal assigned **directly** at the call site; passing a named const
 * (`include: BOARD_INCLUDE`) skips it entirely. Extracting the include for readability is
 * what disabled the one compiler check that would have found it — so the check has to be
 * re-created here, by reading the schema.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const source = readFileSync(path.join(root, "src/server/wiki-insights.ts"), "utf8");

/** Scalar + relation field names declared on a model in schema.prisma. */
function fieldsOf(model: string): Set<string> {
  const block = schema.match(new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m"));
  if (!block) throw new Error(`No model ${model} in prisma/schema.prisma`);
  const names = block[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("///") && !l.startsWith("@@"))
    .map((l) => l.split(/\s+/)[0]);
  return new Set(names);
}

/** The relation each key of BOARD_INCLUDE points at, and the model behind it. */
const RELATION_MODEL: Record<string, string> = {
  seriesPoints: "WikiInsightSeriesPoint",
  vennItems: "WikiInsightVennItem",
  nodes: "WikiInsightNode",
};

describe("BOARD_INCLUDE only names fields that exist", () => {
  it("covers every relation on WikiInsightBoard that the include touches", () => {
    // If a fifth board type adds a fourth child relation, this fails until the map above
    // knows about it — otherwise the checks below would silently skip it.
    const includeBlock = source.match(/const BOARD_INCLUDE = \{([\s\S]*?)\n\}(?: as const)?(?: satisfies [\w.]+)?;/);
    expect(includeBlock, "BOARD_INCLUDE not found — has it been renamed?").toBeTruthy();
    const keys = [...includeBlock![1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual(Object.keys(RELATION_MODEL).sort());
  });

  it.each(Object.entries(RELATION_MODEL))(
    "%s orders only by fields that exist on %s",
    (relation, model) => {
      const fields = fieldsOf(model);
      // Resolve the shared order constant, then any inline orderBy on this relation.
      const shared = source.match(/const CHILD_ORDER = \[([\s\S]*?)\](?: as const)?(?: satisfies [\w.]+)?;/)?.[1] ?? "";
      const inline =
        source.match(new RegExp(`${relation}:\\s*\\{[^}]*orderBy:\\s*\\[([^\\]]*)\\]`))?.[1] ?? "";
      const named = [...`${shared}${inline}`.matchAll(/\{\s*(\w+):/g)].map((m) => m[1]);
      expect(named.length, `no orderBy fields found for ${relation}`).toBeGreaterThan(0);
      for (const field of named) {
        expect(
          fields.has(field),
          `${model} has no field "${field}" — Prisma will throw "Unknown argument \`${field}\`" at runtime, and tsc cannot see it because BOARD_INCLUDE is a named const.`,
        ).toBe(true);
      }
    },
  );

  it("does not order any child by createdAt — none of them have one", () => {
    // Named explicitly because this is the exact field that caused the outage, and it is
    // the natural thing to reach for when adding a tiebreaker.
    for (const model of Object.values(RELATION_MODEL)) {
      expect(fieldsOf(model).has("createdAt"), `${model}`).toBe(false);
    }
    const order = source.match(/const CHILD_ORDER = \[([\s\S]*?)\](?: as const)?(?: satisfies [\w.]+)?;/)?.[1] ?? "";
    expect(order).not.toContain("createdAt");
  });

  it("gives child rows a stable tiebreaker, so equal orderKeys do not reorder per query", () => {
    // Postgres does not promise an order for ties. Two points sharing an orderKey would
    // otherwise swap places between page loads, which reads as a chart redrawing itself.
    const order = source.match(/const CHILD_ORDER = \[([\s\S]*?)\](?: as const)?(?: satisfies [\w.]+)?;/)?.[1] ?? "";
    expect(order).toContain("orderKey");
    expect(order).toContain("id");
  });
});

describe("the board list's own ordering", () => {
  it("orders boards by fields WikiInsightBoard actually has", () => {
    const fields = fieldsOf("WikiInsightBoard");
    const block = source.match(/insightBoards:\s*\{[\s\S]*?orderBy:\s*\[([^\]]*)\]/)?.[1] ?? "";
    const named = [...block.matchAll(/\{\s*(\w+):/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const field of named) {
      expect(fields.has(field), `WikiInsightBoard has no field "${field}"`).toBe(true);
    }
  });
});

describe("one failing section cannot take down the whole wiki", () => {
  const wiki = readFileSync(path.join(root, "src/server/wiki.ts"), "utf8");

  it("wraps every section loader in `settle`", () => {
    // The actual severity of the outage was not the bad column — it was that ONE optional
    // loader rejecting inside `Promise.all` rejected the whole DTO, so clients who had
    // never enabled Insights lost their wiki too.
    const block = wiki.match(/const \[\s*blockers,[\s\S]*?\n {2}\] = await Promise\.all\(\[([\s\S]*?)\n {2}\]\);/);
    expect(block, "the buildDTO loader block was not found — has it been restructured?").toBeTruthy();
    const body = block![1];
    const calls = [...body.matchAll(/^\s{4}(settle\(|load|get)/gm)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(10);
    expect(
      calls.every((c) => c === "settle("),
      "every loader in buildDTO must go through `settle` — a bare call there can 500 the entire wiki.",
    ).toBe(true);
  });

  it("logs the failing section by name rather than swallowing it", () => {
    // A silently-empty section is a section nobody notices has stopped working.
    const fn = wiki.match(/async function settle<T>[\s\S]*?\n\}/)?.[0] ?? "";
    expect(fn).toContain("console.error");
    expect(fn).toContain("section");
    expect(fn).toContain("return fallback");
  });
});
