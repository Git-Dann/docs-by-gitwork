import { describe, expect, it } from "vitest";
import { parseRawSections, serialiseRawSections } from "@/lib/proposals/raw-sections";
import type { ProposalSection } from "@/types/proposal";

const KNOWN = ["cover", "prose", "parties"] as const;

function sections(): ProposalSection[] {
  return [
    {
      id: "a",
      key: "cover",
      title: "Cover",
      description: "Front page.",
      sortOrder: 0,
      isVisible: true,
      data: { proposalTitle: "T" } as unknown as ProposalSection["data"],
    },
    {
      id: "b",
      key: "prose",
      title: "Background",
      description: "",
      sortOrder: 1,
      isVisible: true,
      data: { content: "Hello" } as unknown as ProposalSection["data"],
    },
  ];
}

function edit(mutate: (list: Array<Record<string, unknown>>) => void): string {
  const list = JSON.parse(serialiseRawSections(sections())) as Array<Record<string, unknown>>;
  mutate(list);
  return JSON.stringify(list);
}

describe("parseRawSections", () => {
  it("round-trips an untouched payload", () => {
    const result = parseRawSections(serialiseRawSections(sections()), sections(), KNOWN);
    expect(result.ok).toBe(true);
    expect(result.sections?.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("applies title / visibility / data edits", () => {
    const text = edit((list) => {
      list[1].title = "Why we're here";
      list[1].isVisible = false;
      list[1].data = { content: "Rewritten" };
    });
    const result = parseRawSections(text, sections(), KNOWN);
    expect(result.ok).toBe(true);
    expect(result.sections?.[1].title).toBe("Why we're here");
    expect(result.sections?.[1].isVisible).toBe(false);
    expect(result.sections?.[1].data).toEqual({ content: "Rewritten" });
  });

  // The order in the JSON is the order the document renders in — hand-kept numbers can't drift.
  it("re-derives sortOrder from the array order", () => {
    const text = edit((list) => list.reverse());
    const result = parseRawSections(text, sections(), KNOWN);
    expect(result.ok).toBe(true);
    expect(result.sections?.map((s) => [s.id, s.sortOrder])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });

  it("rejects invalid JSON", () => {
    expect(parseRawSections("{nope", sections(), KNOWN).ok).toBe(false);
  });

  it("rejects a non-array payload", () => {
    expect(parseRawSections('{"key":"prose"}', sections(), KNOWN).error).toMatch(/ARRAY/);
  });

  // A raw edit must never be usable as an accidental delete-everything button.
  it("rejects added or removed blocks", () => {
    const removed = edit((list) => list.pop());
    expect(parseRawSections(removed, sections(), KNOWN).error).toMatch(/Expected 2 blocks, got 1/);
    const added = edit((list) => list.push({ ...list[0], id: "c" }));
    expect(parseRawSections(added, sections(), KNOWN).ok).toBe(false);
  });

  it("rejects an unknown id and a duplicated id", () => {
    expect(parseRawSections(edit((l) => { l[0].id = "zzz"; }), sections(), KNOWN).error).toMatch(/unknown or missing/);
    expect(parseRawSections(edit((l) => { l[1].id = "a"; }), sections(), KNOWN).error).toMatch(/duplicate/);
  });

  // An unregistered key renders as literally nothing — a silently blank document.
  it("rejects an unregistered block key", () => {
    expect(parseRawSections(edit((l) => { l[1].key = "not_a_block"; }), sections(), KNOWN).error).toMatch(
      /not a known block type/,
    );
  });

  it("rejects data that isn't a JSON object", () => {
    for (const bad of ["a string", 3, null, ["x"]] as unknown[]) {
      const text = edit((l) => { l[1].data = bad as never; });
      expect(parseRawSections(text, sections(), KNOWN).error).toMatch(/"data" must be a JSON object/);
    }
  });

  it("rejects wrong types on title / description / isVisible / speakerNotes", () => {
    expect(parseRawSections(edit((l) => { l[0].title = 5; }), sections(), KNOWN).error).toMatch(/"title"/);
    expect(parseRawSections(edit((l) => { l[0].description = 5; }), sections(), KNOWN).error).toMatch(/"description"/);
    expect(parseRawSections(edit((l) => { l[0].isVisible = "yes"; }), sections(), KNOWN).error).toMatch(/"isVisible"/);
    expect(parseRawSections(edit((l) => { l[0].speakerNotes = 5; }), sections(), KNOWN).error).toMatch(/"speakerNotes"/);
  });
});
