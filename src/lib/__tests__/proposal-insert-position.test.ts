import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInsertIndex } from "@/lib/proposal-insert-position";

/**
 * The canvas `+` inserts where you clicked, including on page 3.
 *
 * The bug this guards is specific and quiet: `PagedDocument` renders blocks inside a per-page
 * `map`, so the `index` a block receives is its position ON ITS PAGE. Wiring the `+` to that index
 * would insert at the TOP of the document — and it would pass every test written against a
 * single-page fixture and every manual check on a short document, because on page one the per-page
 * index and the real index are the same number. It only goes wrong once a document paginates,
 * which is every real one.
 *
 * So these fixtures are deliberately long enough to have a page 2 and a page 3.
 */

const root = join(__dirname, "..", "..");
const source = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

/** Ten blocks — roughly three A4 pages of real content. */
const DOC = Array.from({ length: 10 }, (_, i) => ({ id: `sec_${i}` }));

describe("insert position", () => {
  it("lands directly after the block you clicked", () => {
    expect(resolveInsertIndex(DOC, "sec_0")).toBe(1);
    expect(resolveInsertIndex(DOC, "sec_4")).toBe(5);
  });

  it("resolves a block on a LATER page to its real position, not its position on that page", () => {
    // The whole point. `sec_7` is the first block of page three in a 3-3-4 layout: its per-page
    // index is 0, so a per-page wiring would insert at 1 — near the top of the document, three
    // pages from where the author clicked.
    expect(resolveInsertIndex(DOC, "sec_7")).toBe(8);
    expect(resolveInsertIndex(DOC, "sec_7")).not.toBe(1);
  });

  it("appends when the block is the last one", () => {
    expect(resolveInsertIndex(DOC, "sec_9")).toBe(DOC.length);
  });

  it("appends rather than inserting at the top when the block has gone", () => {
    // Removed between the hover and the click — another tab, an undo, an AI apply. Appending is
    // the outcome closest to what was asked for; index 0 is the one that reads as a bug.
    expect(resolveInsertIndex(DOC, "sec_missing")).toBe(DOC.length);
    expect(resolveInsertIndex([], "anything")).toBe(0);
  });
});

/**
 * The canvas must hand back an ID, never an index — that is what makes the above unavailable to
 * get wrong. Source-asserted because the prop contract is not reachable from rendered output.
 */
describe("the canvas passes identity, not position", () => {
  it("the + button calls onInsertAfter with the section id", () => {
    const body = source("components", "proposals", "proposal-section-preview.tsx");
    expect(body).toContain("onClick={() => onInsertAfter(selectionId)}");
    // If this ever becomes an index the per-page trap is back.
    expect(body).not.toMatch(/onInsertAfter\(index\)/);
  });

  it("the editor resolves the position through the tested resolver", () => {
    const body = source("components", "proposals", "proposal-editor-layout.tsx");
    expect(body).toContain("resolveInsertIndex(sectionEntries, sectionId)");
  });

  it("is editor-only — the public, print and preview renders pass no callback", () => {
    // `wrapSelectable` already skips on the public view, but the control should also simply not
    // exist there: only the editor canvas supplies the handler.
    const layout = source("components", "proposals", "proposal-editor-layout.tsx");
    expect(layout.match(/onInsertAfter=\{/g) ?? []).toHaveLength(1);
  });
});
