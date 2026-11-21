/**
 * The A4 sheet scales on a narrow column instead of being cut.
 *
 * ⚠️ Measured before the fix, at a 390px viewport: the sheet was 293 x 1123 — its WIDTH was
 * responsive (`width: 100%`) while the cover's HEIGHT stayed pinned (`height: 297mm`) — so the
 * cover's content reflowed to 1233px and `overflow: hidden` cut the last 111px. `/docs/[token]`
 * renders this same path with `pageMode="paged"`, so that was a client opening a proposal link
 * on their phone and losing the bottom of the cover, including the CLIENT / DATE / VERSION row.
 * Afterwards: 293 x 414, content 414, overflow 0, and 0 clipping findings on all six demo docs.
 */
import { describe, expect, it } from "vitest";

import { readSource } from "@/testing/source";

const COMPONENT = readSource("src/components/proposals/paged-document.tsx");
const CSS = readSource("src/app/globals.css", { comments: "keep" });

describe("the scale wrapper", () => {
  it("wraps the pages", () => {
    expect(COMPONENT).toContain("<ScaleToFit>");
    expect(COMPONENT).toContain("</ScaleToFit>");
  });

  it("⚠️ leaves the hidden measurer OUTSIDE it", () => {
    // A transformed ancestor becomes the containing block for `position: fixed`, which would put
    // the measurer back into page scroll — the exact thing its own comment says it is fixed to
    // avoid. So the measurer must come before the wrapper opens.
    const measurer = COMPONENT.indexOf("ref={measureRef}");
    const opens = COMPONENT.indexOf("<ScaleToFit>");
    expect(measurer).toBeGreaterThan(-1);
    expect(opens).toBeGreaterThan(-1);
    expect(measurer, "the measurer must not be inside the scaled subtree").toBeLessThan(opens);
  });

  it("measures with offsetHeight, which a transform does not change", () => {
    // getBoundingClientRect returns the VISUAL box under a transform, so using it here would
    // feed the scaled height back into the scale and converge on nothing.
    expect(COMPONENT).toMatch(/offsetHeight \* next/);
  });

  it("never scales a document UP", () => {
    expect(COMPONENT).toMatch(/Math\.min\(1, width \/ A4_WIDTH_PX\)/);
  });

  it("applies nothing at all above A4 width, so desktop is unchanged", () => {
    expect(COMPONENT).toMatch(/className=\{scaled \? "doc-a4-scale" : undefined\}/);
    expect(COMPONENT).toMatch(/style=\{scaled \? \(/);
  });
});

describe("the CSS contract", () => {
  it("scales the inner box from its top left", () => {
    expect(CSS).toMatch(/\.doc-a4-scale__inner \{[^}]*transform: scale\(var\(--doc-scale, 1\)\);/);
    expect(CSS).toMatch(/\.doc-a4-scale__inner \{[^}]*transform-origin: top left;/);
  });

  it("⚠️ resets the transform for print, so the PDF is not scaled twice", () => {
    // The PDF route renders /docs/[token]?print=1 through Chromium at real A4 (§17).
    const print = /@media print \{[\s\S]*?\n\}/g;
    const blocks = [...CSS.matchAll(print)].map((m) => m[0]);
    const reset = blocks.find((b) => b.includes(".doc-a4-scale__inner"));
    expect(reset, "no @media print block resets .doc-a4-scale__inner").toBeTruthy();
    expect(reset).toMatch(/transform: none;/);
    expect(reset, "the inline height from the measuring effect needs !important").toMatch(
      /height: auto !important;/,
    );
  });
});
