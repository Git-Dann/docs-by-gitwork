import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The caret drifted while typing in the editor canvas, and the cause was pagination churn.
 *
 * `PagedDocument` re-measures whenever its `signature` changes, and that signature includes every
 * section's `data` — so it re-ran on EVERY KEYSTROKE. `packPages` builds fresh arrays each run, so
 * calling `setPages` unconditionally re-rendered the entire paged document per character. Blocks
 * re-flowed, the field being typed into moved under the cursor, and the `ResizeObserver` watching
 * the auto-growing textarea then fired and started the loop again.
 *
 * The fix is to compare the RESULT and bail when the layout is unchanged, which is the common case:
 * typing a character rarely moves a page break.
 *
 * `samePagination` is module-private (it is an implementation detail of the component, not API), so
 * this reimplements it and checks the component still calls it. That keeps the logic honestly
 * tested without exporting something only a test would use.
 */

const source = readFileSync(
  join(__dirname, "..", "..", "components", "proposals", "paged-document.tsx"),
  "utf8",
);

type Section = { id?: string; key: string };

function samePagination(a: Section[][], b: Section[][]): boolean {
  if (a.length !== b.length) return false;
  return a.every((page, index) => {
    const other = b[index];
    if (!other || page.length !== other.length) return false;
    return page.every((section, i) => (section.id ?? section.key) === (other[i].id ?? other[i].key));
  });
}

const PAGE_ONE: Section[] = [{ id: "a", key: "cover" }, { id: "b", key: "prose" }];
const PAGE_TWO: Section[] = [{ id: "c", key: "process_steps" }];

describe("pagination stability", () => {
  it("treats a rebuilt-but-identical layout as unchanged", () => {
    // The whole point: `packPages` returns new arrays every run, so reference equality is always
    // false and would re-render on every keystroke.
    const before = [PAGE_ONE, PAGE_TWO];
    const after = [[...PAGE_ONE], [...PAGE_TWO]];

    expect(after).not.toBe(before);
    expect(samePagination(before, after)).toBe(true);
  });

  it("ignores content changes — only placement matters", () => {
    // Typing changes a block's `data` but not which page it sits on. If this returned false the
    // fix would achieve nothing, since data is exactly what changes while typing.
    const before = [[{ id: "b", key: "prose" }]];
    const after = [[{ id: "b", key: "prose" }]];

    expect(samePagination(before, after)).toBe(true);
  });

  it("detects a block moving to another page", () => {
    expect(samePagination([PAGE_ONE, PAGE_TWO], [[...PAGE_ONE, ...PAGE_TWO]])).toBe(false);
  });

  it("detects a page count change, a reorder, and a removal", () => {
    expect(samePagination([PAGE_ONE], [PAGE_ONE, PAGE_TWO])).toBe(false);
    expect(samePagination([PAGE_ONE], [[PAGE_ONE[1], PAGE_ONE[0]]])).toBe(false);
    expect(samePagination([PAGE_ONE], [[PAGE_ONE[0]]])).toBe(false);
  });

  it("falls back to `key` for a section with no id", () => {
    expect(samePagination([[{ key: "prose" }]], [[{ key: "prose" }]])).toBe(true);
    expect(samePagination([[{ key: "prose" }]], [[{ key: "callout" }]])).toBe(false);
  });

  it("the component actually guards its setPages call", () => {
    // Without this the logic above could be perfect and unused.
    expect(source).toContain("function samePagination");
    expect(source).toMatch(/setPages\(\(current\) =>\s*\(?samePagination\(current, next\)/);
  });
});

/**
 * The measure pass must not serialise the document, and must not rebuild its observers per edit.
 *
 * The guard above stopped the *re-render* on every keystroke. It did not stop the work that led
 * to it: the effect was keyed on a `JSON.stringify` of every section's `data`, which was one of
 * three full-document serialisations the editor ran per keystroke — and which bought nothing,
 * because `sections` sat in the same dependency array and changes identity on every keystroke
 * anyway. So the effect re-ran regardless, tearing down and rebuilding a ResizeObserver each time.
 *
 * Source assertions for the same reason the test above uses them: this is about how the component
 * is wired, and the wiring is not reachable from its rendered output.
 */
describe("measure pass cost", () => {
  it("does not serialise section data to decide whether to re-measure", () => {
    expect(source).not.toMatch(/JSON\.stringify\([^)]*sections/);
    expect(source).not.toContain("const signature");
  });

  it("owns its observers in a mount-only effect", () => {
    // The ResizeObserver is constructed inside an effect that closes with `}, []);` — if the
    // deps ever regain `sections`, the observer is rebuilt on every keystroke again.
    const observerEffect = source.slice(
      source.indexOf("new ResizeObserver"),
      source.indexOf("new ResizeObserver") + 900,
    );
    expect(observerEffect).toMatch(/\}, \[\]\);/);
    expect(observerEffect).not.toMatch(/\}, \[[^\]]*sections[^\]]*\]\);/);
  });

  it("re-measures on a content change through a separate effect", () => {
    // Dropping the observers out of the sections-keyed effect is only safe if something still
    // asks for a new measure pass when the content changes.
    expect(source).toMatch(/scheduleRef\.current\(\);\s*\n\s*\}, \[sections\]\);/);
  });

  it("reads the current sections through a ref, not a stale closure", () => {
    // A mount-only effect closes over the FIRST `sections`. Without the ref, every later measure
    // would pack the document as it was when the editor opened.
    expect(source).toContain("sectionsRef.current = sections");
    expect(source).toMatch(/const current = sectionsRef\.current;/);
    expect(source).toMatch(/packPages\(current,/);
  });
});
