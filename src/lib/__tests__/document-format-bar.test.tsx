import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentFormatBar } from "@/components/proposals/document-format-bar";
import { FormatTargetProvider } from "@/lib/sections/format-target";
import { wrapSelection } from "@/lib/sections/inline-format-toolbar";

/**
 * The bar must be HONEST about what it can do.
 *
 * With nothing focused every control is inert; a control lights up only when the focused field
 * declares that command. A bar that is always lit but silently does nothing is worse than no bar
 * — it teaches people the buttons are broken, and they stop trying.
 *
 * Rendered rather than reasoned about, because "is it disabled" is a property of the markup.
 */

function bar(inProvider: boolean): string {
  const element = <DocumentFormatBar />;
  return renderToStaticMarkup(
    inProvider ? <FormatTargetProvider>{element}</FormatTargetProvider> : element,
  );
}

const CONTROLS = ["Bold", "Italic", "Bulleted list", "Link", "Code"];

describe("DocumentFormatBar", () => {
  it("renders every control", () => {
    const html = bar(true);
    for (const label of CONTROLS) expect(html, label).toContain(`aria-label="${label}"`);
  });

  it("is entirely inert when no field is focused", () => {
    // The default state, and the one people see most of the time.
    const html = bar(true);

    expect(html.match(/disabled=""/g) ?? []).toHaveLength(CONTROLS.length);
  });

  it("renders inert OUTSIDE a provider instead of throwing", () => {
    // The editable field components also render on the public share page and in the PDF route,
    // where there is no toolbar and no provider. Formatting simply isn't offered there.
    expect(() => bar(false)).not.toThrow();
    expect(bar(false).match(/disabled=""/g) ?? []).toHaveLength(CONTROLS.length);
  });

  it("tells you WHY a control is inert, rather than just dimming it", () => {
    expect(bar(true)).toContain("click into some text first");
  });

  it("is exposed as a toolbar to assistive tech", () => {
    expect(bar(true)).toContain('role="toolbar"');
  });
});

/**
 * The command transform itself. Pure, so the maths is testable without a DOM — and the selection
 * maths is where this kind of thing actually goes wrong.
 */
describe("wrapSelection", () => {
  it("wraps a selection in the right markers", () => {
    expect(wrapSelection("one two", 0, 3, "bold")?.value).toBe("**one** two");
    expect(wrapSelection("one two", 0, 3, "italic")?.value).toBe("*one* two");
    expect(wrapSelection("one two", 0, 3, "code")?.value).toBe("`one` two");
  });

  it("keeps the original text selected, so you can keep formatting it", () => {
    const result = wrapSelection("one two", 0, 3, "bold");

    expect(result?.value.slice(result.start, result.end)).toBe("one");
  });

  it("selects the URL after making a link, not the label", () => {
    // The label is already what you highlighted; the next thing you want to type is where it goes.
    const result = wrapSelection("Gitwork site", 0, 12, "link");

    expect(result?.value).toBe("[Gitwork site](https://)");
    expect(result?.value.slice(result.start, result.end)).toBe("https://");
  });

  it("does nothing at a bare caret", () => {
    // Inserting `****` around the cursor looks like a bug to whoever typed it.
    for (const command of ["bold", "italic", "code", "link"] as const) {
      expect(wrapSelection("one two", 3, 3, command), command).toBeNull();
    }
  });

  it("wraps a mid-string selection at the right offsets", () => {
    expect(wrapSelection("one two three", 4, 7, "bold")?.value).toBe("one **two** three");
  });
});
