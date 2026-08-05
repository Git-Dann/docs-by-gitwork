import { describe, expect, it } from "vitest";
import { toggleBulletLines } from "@/lib/sections/inline-format-toolbar";

/**
 * Bulleting is a LINE operation, not a selection wrap — which is where the fiddly bits are, so the
 * transform is pure and tested here rather than only through a button.
 */

/** Toggle over the whole value, the common case (caret in an empty field, or select-all). */
function toggleAll(value: string) {
  return toggleBulletLines(value, 0, value.length).value;
}

describe("toggleBulletLines", () => {
  it("bullets every line in the selection", () => {
    expect(toggleAll("One\nTwo\nThree")).toBe("- One\n- Two\n- Three");
  });

  it("bullets the WHOLE line even when only a word is selected", () => {
    // A bullet is a property of the line. Selecting "wo" inside "Two" must bullet that line.
    const value = "One\nTwo\nThree";
    const start = value.indexOf("wo");
    const result = toggleBulletLines(value, start, start + 2);

    expect(result.value).toBe("One\n- Two\nThree");
  });

  it("un-bullets when every touched line is already a bullet", () => {
    expect(toggleAll("- One\n- Two")).toBe("One\nTwo");
  });

  it("normalises a MIXED selection into a clean list", () => {
    // Flipping per line would leave a half-marked list. Blindly prefixing would double-mark the
    // line that was already a bullet ("- - One"). Neither is what you wanted.
    expect(toggleAll("- One\nTwo")).toBe("- One\n- Two");
  });

  it("leaves blank lines alone", () => {
    // A blank line is spacing; bulleting it would print an empty list item.
    expect(toggleAll("One\n\nTwo")).toBe("- One\n\n- Two");
  });

  it("preserves indentation", () => {
    expect(toggleAll("  One")).toBe("  - One");
    expect(toggleAll("  - One")).toBe("  One");
  });

  it("treats `*` as a bullet when removing", () => {
    expect(toggleAll("* One\n* Two")).toBe("One\nTwo");
  });

  it("handles a caret with no selection", () => {
    const value = "One\nTwo";
    const at = value.indexOf("Two");

    expect(toggleBulletLines(value, at, at).value).toBe("One\n- Two");
  });

  it("returns a selection covering the lines it changed", () => {
    const result = toggleBulletLines("One\nTwo", 0, 7);

    expect(result.start).toBe(0);
    expect(result.value.slice(result.start, result.end)).toBe("- One\n- Two");
  });

  it("round-trips: bullet then un-bullet restores the original", () => {
    const original = "  Paginate DMS\nFor each customer\n\nSkip zero-vehicle customers";

    expect(toggleAll(toggleAll(original))).toBe(original);
  });

  it("does not bullet an empty field into a stray marker", () => {
    expect(toggleAll("")).toBe("");
  });
});
