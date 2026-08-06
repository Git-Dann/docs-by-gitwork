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

/**
 * Undo history is structurally shared, not serialised.
 *
 * Each snapshot used to be `JSON.stringify(draft)`, restored with `JSON.parse` — so a hundred
 * steps of history held a hundred independent copies of the whole document, and every
 * non-coalesced edit paid a full-document serialisation to produce one.
 *
 * Snapshots are now the draft objects themselves. Every edit path rebuilds only what it touches,
 * so consecutive snapshots share all their unchanged sections. That is safe because drafts are
 * never mutated in place — which is not a convention but a requirement: this editor repaints off
 * reference changes, so anything mutating a section's data in place would already fail to render.
 * If that ever stops being true, the aliasing shows up here as corrupted history, so the
 * assertions below are the tripwire.
 */
describe("undo history does not copy the document", () => {
  const body = () => source("components", "proposals", "proposal-editor-layout.tsx");

  it("pushes the draft itself onto the stacks", () => {
    expect(body()).toMatch(/pastRef\.current\.push\(draft\)/);
    expect(body()).toMatch(/futureRef\.current\.push\(draft\)/);
  });

  it("never serialises or revives a history entry", () => {
    expect(body()).not.toMatch(/(past|future)Ref\.current\.push\(JSON\.stringify/);
    expect(body()).not.toMatch(/JSON\.parse\((past|future)Ref\.current\.pop/);
  });

  it("types the stacks as documents, so a string can never be pushed again", () => {
    // The type is what stops this regressing quietly — a stringify would no longer compile.
    expect(body()).toMatch(/pastRef = useRef<ProposalDocument\[\]>/);
    expect(body()).toMatch(/futureRef = useRef<ProposalDocument\[\]>/);
  });

  it("still bounds the history", () => {
    // Structural sharing makes each step cheap, not free — an unbounded stack still leaks.
    expect(body()).toMatch(/pastRef\.current\.length > 100\) pastRef\.current\.shift\(\)/);
  });
});

/**
 * The outline does not re-render while you type.
 *
 * `sectionEntries` is derived from the draft, so it — and every entry object in it — gets a fresh
 * identity on every keystroke. Handing that straight to the outline meant re-rendering up to 38
 * dnd-kit sortable rows per character, none of which could look any different: the outline draws
 * a number, a title, an icon and a visibility state, and none of those is what changes while
 * typing.
 *
 * The fix has three halves and all three are load-bearing — a memo is defeated by a new array, by
 * a new entry object, OR by a new callback. The dangerous shortcut is a memo comparator that
 * ignores the callbacks: that pins the outline to whichever render it last accepted, so deleting
 * a section acts on the document as it was several keystrokes ago. That is precisely the
 * staleness class the top of this file exists for, which is why the callbacks are stabilised
 * through a ref instead.
 */
describe("the outline is projected, not re-rendered", () => {
  const body = () => source("components", "proposals", "proposal-editor-layout.tsx");

  type Entry = { id: string; order: number; title: string; sectionKey: string; isVisible: boolean };

  // Reimplemented, like `samePagination` in the pagination suite: it is an implementation detail
  // of the component, not API, and the last assertion checks the component still uses it.
  function sameOutlineEntries(a: Entry[], b: Entry[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((entry, index) => {
      const other = b[index];
      return (
        entry.id === other.id &&
        entry.order === other.order &&
        entry.title === other.title &&
        entry.sectionKey === other.sectionKey &&
        entry.isVisible === other.isVisible
      );
    });
  }

  const OUTLINE: Entry[] = [
    { id: "a", order: 1, title: "Cover", sectionKey: "cover", isVisible: true },
    { id: "b", order: 2, title: "Introduction", sectionKey: "introduction", isVisible: true },
  ];

  it("treats a rebuilt-but-identical projection as unchanged", () => {
    // Typing rebuilds the array and every entry in it. If this were false the projection would
    // change identity on every keystroke and the memo would never once bite.
    const after = OUTLINE.map((entry) => ({ ...entry }));

    expect(after).not.toBe(OUTLINE);
    expect(after[0]).not.toBe(OUTLINE[0]);
    expect(sameOutlineEntries(OUTLINE, after)).toBe(true);
  });

  it("notices every structural change the outline actually draws", () => {
    const changes: Array<Partial<Entry>> = [
      { title: "Renamed" },
      { order: 9 },
      { sectionKey: "prose" },
      { isVisible: false },
      { id: "different" },
    ];

    for (const change of changes) {
      const after = [{ ...OUTLINE[0], ...change }, OUTLINE[1]];
      expect(
        sameOutlineEntries(OUTLINE, after),
        `change ${JSON.stringify(change)} slipped through`,
      ).toBe(false);
    }

    expect(sameOutlineEntries(OUTLINE, [OUTLINE[0]])).toBe(false);
  });

  it("projects away `data` — the one field that changes while typing", () => {
    // The projection must not carry the section object through, or the memo compares an object
    // that is new on every keystroke.
    expect(body()).toMatch(/const projectedOutline = sectionEntries\.map/);
    expect(body()).not.toMatch(/const projectedOutline[\s\S]{0,200}section: entry\.section/);
    expect(body()).toMatch(/interface OutlineEntry \{[^}]*\}/);
    expect(body()).not.toMatch(/interface OutlineEntry \{[^}]*data/);
  });

  it("holds the projection at a stable identity", () => {
    expect(body()).toMatch(
      /if \(!sameOutlineEntries\(outlineRef\.current, projectedOutline\)\) \{\s*\n\s*outlineRef\.current = projectedOutline;/,
    );
  });

  it("memoises both outline components", () => {
    expect(body()).toMatch(/const OutlineRail = memo\(OutlineRailBase\)/);
    expect(body()).toMatch(/const TableOfContentsCard = memo\(TableOfContentsCardBase\)/);
  });

  it("passes the projection, not the raw entries", () => {
    // Passing `sectionEntries` to either would silently undo all of the above.
    const outlineProps = body().slice(body().indexOf("<TableOfContentsCard"), body().indexOf("<TableOfContentsCard") + 500);
    expect(outlineProps).toContain("sections={outlineEntries}");
    const railProps = body().slice(body().indexOf("<OutlineRail"), body().indexOf("<OutlineRail") + 300);
    expect(railProps).toContain("sections={outlineEntries}");
  });

  it("stabilises the callbacks through a ref, not a memo comparator", () => {
    // The ref is what keeps them from going stale. A custom `areEqual` that skipped the callbacks
    // would memo just as well and be wrong.
    expect(body()).toMatch(/function useStableCallback/);
    expect(body()).toMatch(/ref\.current = fn;/);
    expect(body()).toMatch(/ref\.current\(\.\.\.args\)/);
    expect(body()).not.toMatch(/memo\((OutlineRailBase|TableOfContentsCardBase), /);

    for (const handler of [
      "onSelect={onOutlineSelect}",
      "onEditOptions={onOutlineEditOptions}",
      "onInsertAt={onOutlineInsertAt}",
      "onDeleteSection={onOutlineDelete}",
      "onReorder={onOutlineReorder}",
      "onToggleVisibility={onOutlineToggleVisibility}",
    ]) {
      expect(body(), `${handler} is not a stable callback`).toContain(handler);
    }
  });
});
