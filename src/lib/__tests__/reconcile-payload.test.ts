import { describe, expect, it } from "vitest";
import {
  reconcileSectionPayload,
  type EditableSection,
} from "@/lib/sections/reconcile-payload";

/**
 * The guard behind the raw block-payload editor.
 *
 * Editing sections as JSON is genuinely useful — it is the only way to fix a malformed block or
 * bulk-retitle without dragging. It is also the easiest way to destroy a document, because a paste
 * with one entry missing silently deletes a block and everything in it.
 *
 * So the contract is narrow and these tests exist to pin it:
 *   ALLOWED   reorder · retitle · re-caption · hide/show · rewrite `data`
 *   REFUSED   add a block · delete a block · invent a key · change a block's type
 *
 * Everything permitted is recoverable by editing again. Everything refused is not.
 */

function section(overrides: Partial<EditableSection> = {}): EditableSection {
  return {
    id: "a",
    key: "prose",
    title: "Background",
    description: null,
    isVisible: true,
    sortOrder: 0,
    data: { body: "text" },
    ...overrides,
  };
}

const CURRENT: EditableSection[] = [
  section({ id: "a", key: "cover", title: "Cover", sortOrder: 0 }),
  section({ id: "b", key: "prose", title: "Background", sortOrder: 1 }),
  section({ id: "c", key: "signatures", title: "Signatures", sortOrder: 2 }),
];

/** The payload shape the editor round-trips — what `JSON.stringify(sections)` produces. */
function payloadOf(sections: EditableSection[]) {
  return sections.map((s) => ({
    id: s.id,
    key: s.key,
    title: s.title,
    description: s.description,
    isVisible: s.isVisible,
    data: s.data,
  }));
}

function ok(result: ReturnType<typeof reconcileSectionPayload>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.errors.join(" | ")}`);
  return result;
}

function failed(result: ReturnType<typeof reconcileSectionPayload>) {
  if (result.ok) throw new Error("expected failure, got ok");
  return result;
}

describe("reconcileSectionPayload — allowed", () => {
  it("accepts an unchanged payload and reports no changes", () => {
    const result = ok(reconcileSectionPayload(CURRENT, payloadOf(CURRENT)));

    expect(result.sections.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(result.changes).toEqual([]);
  });

  it("reorders, renumbering sortOrder from 0", () => {
    const reordered = [CURRENT[2], CURRENT[0], CURRENT[1]];
    const result = ok(reconcileSectionPayload(CURRENT, payloadOf(reordered)));

    expect(result.sections.map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(result.sections.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
    expect(result.changes).toContain("Reordered blocks");
  });

  it("retitles, re-captions, hides and rewrites data", () => {
    const edited = payloadOf(CURRENT);
    edited[1].title = "Why we're here";
    edited[1].description = "A caption";
    edited[2].isVisible = false;
    edited[0].data = { proposalTitle: "New" };

    const result = ok(reconcileSectionPayload(CURRENT, edited));

    expect(result.sections[1].title).toBe("Why we're here");
    expect(result.sections[1].description).toBe("A caption");
    expect(result.sections[2].isVisible).toBe(false);
    expect(result.sections[0].data).toEqual({ proposalTitle: "New" });
    expect(result.changes).toEqual(
      expect.arrayContaining([
        'Retitled "Background" → "Why we\'re here"',
        'Changed the caption on "Why we\'re here"',
        'Hid "Signatures"',
        'Rewrote the contents of "Cover"',
      ]),
    );
  });

  it("keeps the original value for any field the payload omits", () => {
    // A hand-edited paste routinely drops a field. Omission must mean "unchanged", never "clear".
    const result = ok(reconcileSectionPayload(CURRENT, [{ id: "a" }, { id: "b" }, { id: "c" }]));

    expect(result.sections.map((s) => s.title)).toEqual(["Cover", "Background", "Signatures"]);
    expect(result.sections[0].data).toEqual({ body: "text" });
  });
});

describe("reconcileSectionPayload — refused", () => {
  it("refuses a DELETED block, naming it", () => {
    // The dangerous one: a paste one entry short would silently destroy a block and its content.
    const result = failed(reconcileSectionPayload(CURRENT, payloadOf([CURRENT[0], CURRENT[1]])));

    expect(result.errors.join(" ")).toContain("Signatures");
    expect(result.errors.join(" ")).toContain("outline");
  });

  it("refuses an ADDED block", () => {
    const result = failed(
      reconcileSectionPayload(CURRENT, [...payloadOf(CURRENT), { id: "zzz", key: "prose" }]),
    );

    expect(result.errors.join(" ")).toContain("zzz");
  });

  it("refuses a duplicated id", () => {
    const result = failed(
      reconcileSectionPayload(CURRENT, [...payloadOf(CURRENT), payloadOf(CURRENT)[0]]),
    );

    expect(result.errors.join(" ")).toContain("more than once");
  });

  it("refuses an entry with no id", () => {
    const edited = payloadOf(CURRENT) as Array<Record<string, unknown>>;
    delete edited[1].id;

    expect(failed(reconcileSectionPayload(CURRENT, edited)).errors.join(" ")).toContain("id");
  });

  it("refuses a payload that isn't an array", () => {
    expect(failed(reconcileSectionPayload(CURRENT, { a: 1 })).errors[0]).toContain("array");
    expect(failed(reconcileSectionPayload(CURRENT, "nope")).errors[0]).toContain("array");
    expect(failed(reconcileSectionPayload(CURRENT, null)).errors[0]).toContain("array");
  });

  it("reports EVERY problem, not just the first", () => {
    // A bad paste usually has one cause and several symptoms; fixing them one round-trip at a
    // time is miserable.
    const result = failed(
      reconcileSectionPayload(CURRENT, [{ id: "a" }, { id: "a" }, { id: "ghost" }]),
    );

    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("reconcileSectionPayload — key is never taken from the payload", () => {
  it("ignores an attempt to change a block's type", () => {
    // `key` selects the renderer AND the editor, so a changed key turns a block into a different
    // type while keeping data shaped for the old one. Changing type is a create + delete.
    const edited = payloadOf(CURRENT);
    edited[1].key = "signatures";

    const result = ok(reconcileSectionPayload(CURRENT, edited));

    expect(result.sections[1].key).toBe("prose");
  });
});

describe("reconcileSectionPayload — identity", () => {
  it("keys on id, so two blocks of the SAME type are not collapsed", () => {
    // A document can legitimately carry two `prose` blocks. Keying on `key` would merge them and
    // keying on position would make a reorder indistinguishable from a rewrite.
    const twoProse: EditableSection[] = [
      section({ id: "p1", key: "prose", title: "One", sortOrder: 0 }),
      section({ id: "p2", key: "prose", title: "Two", sortOrder: 1 }),
    ];

    const result = ok(reconcileSectionPayload(twoProse, payloadOf([twoProse[1], twoProse[0]])));

    expect(result.sections.map((s) => s.title)).toEqual(["Two", "One"]);
  });
});
