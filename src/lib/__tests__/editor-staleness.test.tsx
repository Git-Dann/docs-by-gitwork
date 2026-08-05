import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toggleBulletLines, wrapSelection } from "@/lib/sections/inline-format-toolbar";

/**
 * Two staleness bugs that shipped together, both invisible to every test that existed.
 *
 * 1. **The formatting command froze on focus.** The registry stores a field's `run` closure once,
 *    when it gains focus. Closing over `value` directly meant every keystroke after that left the
 *    command acting on old text. The symptom was precise and misleading: clicking Bold moved the
 *    selection highlight — `setSelectionRange` ran — while the text never changed, because the
 *    edit was computed from and written back as the stale string. Bullets looked like a dead
 *    button for the same reason.
 *
 * 2. **The canvas froze between re-paginations.** `pages` holds packed section objects, and the
 *    guard that stops re-paginating on every keystroke (which fixed the drifting caret) also kept
 *    the OLD array — so the page kept rendering last pack's copy of each block. Ticking "Show
 *    line numbers" updated the rail and changed nothing on the page.
 *
 * Both are the same class: state captured at one moment, read at another. The unit tests passed
 * throughout, because each half was correct in isolation.
 */

const root = join(__dirname, "..", "..");

function source(...parts: string[]): string {
  return readFileSync(join(root, ...parts), "utf8");
}

describe("formatting commands never freeze", () => {
  it("InlineTextArea reads value+onChange through a ref, not a closure", () => {
    const body = source("lib", "sections", "inline-text.tsx");

    // The ref is the fix. Without it `run` must list `value` in its deps, which makes it a NEW
    // function every keystroke while the registry still holds the one captured at focus.
    expect(body).toContain("const latest = useRef({ value, onChange });");
    expect(body).toContain("const { value, onChange } = latest.current;");
  });

  it("InlineTextArea's `run` has an EMPTY dependency list", () => {
    // Referential stability is the point: registered once, correct forever. A non-empty dep list
    // means the registered closure and the current one can diverge again.
    const body = source("lib", "sections", "inline-text.tsx");
    // Slice to the callback's OWN closing `  );` at two-space indent — the body contains nested
    // `);` of its own, so a naive search for the first one cuts the block in half.
    const from = body.indexOf("const run = useCallback(");
    const run = body.slice(from, body.indexOf("\n  );", from));

    expect(run).toMatch(/\},\s*\[\],?\s*$/);
  });

  it("RichInlineEditor applies the same discipline", () => {
    const body = source("lib", "sections", "rich-inline-editor.tsx");

    // `serialize` joined the ref when the list command was fixed: that path writes the DOM back
    // to the value, and a stale `serialize` would write into a handler the block has moved on
    // from. Asserted loosely enough to survive another command being added, tightly enough to
    // fail if the ref is removed.
    expect(body).toMatch(/const handlers = useRef\(\{[^}]*applyInline[^}]*serialize[^}]*\}\);/);
    expect(body).toContain("handlers.current");
  });
});

describe("the canvas never renders a stale block", () => {
  it("resolves each page's sections from the current props by id", () => {
    // The layout may legitimately be stale — that is the caret fix. The CONTENT may not.
    const body = source("components", "proposals", "paged-document.tsx");

    expect(body).toContain("const pageSections = packedPage.map(");
    expect(body).toContain("sections.find((s) => (s.id ?? s.key) === (packed.id ?? packed.key))");
  });

  it("still guards re-pagination, so the caret fix is intact", () => {
    const body = source("components", "proposals", "paged-document.tsx");

    expect(body).toMatch(/setPages\(\(current\) =>\s*\(?samePagination\(current, next\)/);
  });
});

/**
 * The transforms themselves, applied to a value that has MOVED ON since focus — the exact shape
 * of the bug, expressed as behaviour rather than as source.
 */
describe("commands act on the text as it is now", () => {
  it("bolds the current text, not the text at focus time", () => {
    const atFocus = "Preferred";
    const now = "Preferred File Formats";

    // Selecting "File" in the CURRENT string must wrap "File".
    const start = now.indexOf("File");
    const result = wrapSelection(now, start, start + 4, "bold");

    expect(result?.value).toBe("Preferred **File** Formats");
    // Against the stale string those offsets fall off the end and produce nonsense — which is
    // precisely why the old code appeared to do nothing.
    expect(wrapSelection(atFocus, start, start + 4, "bold")?.value).not.toBe(result?.value);
  });

  it("bullets the current lines, not the lines at focus time", () => {
    const now = "JSON — the only format\nNo CSV route exists yet";

    expect(toggleBulletLines(now, 0, now.length).value).toBe(
      "- JSON — the only format\n- No CSV route exists yet",
    );
  });
});
