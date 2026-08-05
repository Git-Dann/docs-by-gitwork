import { describe, expect, it } from "vitest";
import { toggleBulletLines, wrapSelection } from "@/lib/sections/inline-format-toolbar";

/**
 * Formatting TOGGLES. All of it.
 *
 * Bold twice used to produce `****text****`, which no editor anyone has ever used does — and
 * bullets in this same toolbar already toggled, so it was inconsistent by its own hand.
 *
 * Toggling off has to work regardless of how the selection was dragged, which is the part that
 * makes it more than a one-liner: the markers can be INSIDE the selection (you selected
 * `**File**`) or OUTSIDE it (you selected `File` between them). Handling only one means the
 * toggle works or doesn't depending on how you happened to select, which reads as broken.
 */

/** Apply to the whole string, the simple case. */
function toggleAll(value: string, command: "bold" | "italic" | "code") {
  return wrapSelection(value, 0, value.length, command)?.value;
}

describe("wrapSelection toggles on", () => {
  it("wraps a plain selection", () => {
    expect(toggleAll("File", "bold")).toBe("**File**");
    expect(toggleAll("File", "italic")).toBe("*File*");
    expect(toggleAll("File", "code")).toBe("`File`");
  });
});

describe("wrapSelection toggles OFF", () => {
  it("unwraps when the markers are inside the selection", () => {
    // Pressing the button twice in a row: the second press sees the markers it just added.
    expect(toggleAll("**File**", "bold")).toBe("File");
    expect(toggleAll("*File*", "italic")).toBe("File");
    expect(toggleAll("`File`", "code")).toBe("File");
  });

  it("unwraps when the markers sit outside the selection", () => {
    // You dragged over just the word, not its markers — far more common in practice.
    const value = "Preferred **File** Formats";
    const start = value.indexOf("File");
    const result = wrapSelection(value, start, start + 4, "bold");

    expect(result?.value).toBe("Preferred File Formats");
  });

  it("leaves the text selected after unwrapping, so it can be toggled straight back", () => {
    const result = wrapSelection("**File**", 0, 8, "bold");

    expect(result?.value.slice(result.start, result.end)).toBe("File");
  });

  it("round-trips: on, off, back to the original", () => {
    for (const command of ["bold", "italic", "code"] as const) {
      const once = wrapSelection("File", 0, 4, command);
      const twice = wrapSelection(once!.value, once!.start, once!.end, command);

      expect(twice?.value, command).toBe("File");
    }
  });
});

describe("italic does not corrupt bold", () => {
  it("does not strip one `*` off a `**` pair when the selection includes them", () => {
    // `**x**` starts with the italic marker too. Treating it as italic would leave `*x*` and
    // silently downgrade bold to italic.
    expect(toggleAll("**File**", "italic")).not.toBe("*File*");
  });

  it("makes bold text bold-ITALIC rather than corrupting the pair", () => {
    // Stripping one `*` off each side would leave `*File**` — corrupt rather than un-italicised.
    // The correct result is `***File***`, which the renderer now understands (it previously
    // printed literal asterisks around the word, so the toolbar could put stray punctuation in a
    // client's document).
    const value = "Preferred **File** Formats";
    const start = value.indexOf("File");

    expect(wrapSelection(value, start, start + 4, "italic")?.value).toBe(
      "Preferred ***File*** Formats",
    );
  });
});

describe("bullets already toggled, and still do", () => {
  it("adds then removes", () => {
    const on = toggleBulletLines("One\nTwo", 0, 7);
    expect(on.value).toBe("- One\n- Two");

    expect(toggleBulletLines(on.value, on.start, on.end).value).toBe("One\nTwo");
  });
});

describe("a bare caret still does nothing", () => {
  it("never inserts empty markers", () => {
    // `****` around the cursor looks like a bug to whoever typed it.
    for (const command of ["bold", "italic", "code", "link"] as const) {
      expect(wrapSelection("File", 2, 2, command), command).toBeNull();
    }
  });
});

describe("the renderer understands everything the toolbar can write", () => {
  it("renders bold-italic as nested elements, not literal asterisks", async () => {
    // The guard that makes the italic-on-bold case safe: if the renderer can't read what the
    // toolbar writes, the toolbar is putting stray punctuation in a client's document.
    const { renderInline } = await import("@/lib/markdown");
    const { renderToStaticMarkup } = await import("react-dom/server");

    const html = renderToStaticMarkup(<>{renderInline("***File***", "k")}</>);

    expect(html).toContain("<em>File</em>");
    expect(html).toContain("<strong");
    expect(html).not.toMatch(/^\*|\*$/);
  });
});
