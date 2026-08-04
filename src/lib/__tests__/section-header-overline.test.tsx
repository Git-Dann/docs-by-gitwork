import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The section header, per the Gitwork reference: a mono accent OVERLINE carrying the number,
 * then the BOLD display title, then the caption. Hierarchy reads top-to-bottom.
 *
 * It replaces a fixed 3rem left gutter holding the number beside the title. That is a
 * table-of-contents idiom, not a section header: it indented every heading away from the text
 * column beneath it, so nothing on the page shared a left edge.
 *
 * The ` · ` separator is the reference's own — its eyebrows read `NDA · signature requested`.
 *
 * Asserted on rendered markup because this has been reported repeatedly and "fixed" against
 * things that were not the rendered page.
 */

vi.mock("@/hooks/use-workspace-branding", () => ({
  useWorkspaceBranding: () => ({ logoUrl: "", clientLogoUrl: "" }),
}));

import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";

const SECTION = {
  id: "s1",
  key: "parties",
  title: "Parties",
  description: "Counterparties to this Agreement.",
  sortOrder: 1,
  isVisible: true,
  data: {
    intro: "",
    parties: [
      { id: "p1", name: "Gitwork Group Ltd", role: "", organization: "", email: "dan@gitwork.co.uk" },
    ],
  },
};

function render() {
  const proposal = {
    id: "d1",
    title: "Mutual Non-Disclosure Agreement",
    documentType: "NDA",
    status: "DRAFT",
    clientName: "Acme",
    productName: "",
    version: "1.0",
    summary: "",
    metadata: {
      client: "Acme",
      owner: "Dan Lindsay",
      version: "1.0",
      productSignOff: false,
      techSignOff: false,
      approvalChecked: false,
    },
    sections: [SECTION],
    costLineItems: [],
    timelinePhases: [],
    links: [],
    ctas: [],
    assets: [],
  };

  const Preview = ProposalSectionPreview as unknown as (
    props: Record<string, unknown>,
  ) => ReactElement;

  return renderToStaticMarkup(<Preview section={SECTION} proposal={proposal} index={0} />);
}

describe("section header", () => {
  it("renders the number as an overline that precedes the title", () => {
    const html = render();

    const overline = html.indexOf("01");
    const title = html.indexOf("<h2");

    expect(overline).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(-1);
    // Document order IS the visual order here, so this is what "overline, not gutter" means
    // structurally: the number is a sibling ABOVE the heading, not a cell beside it.
    expect(overline).toBeLessThan(title);
  });

  it("uses the reference's ` · ` separator between number and section name", () => {
    expect(render()).toContain(" · ");
  });

  it("sets the overline in accent mono caps, not muted", () => {
    const html = render();
    const overlineTag = html.slice(html.indexOf("<p"), html.indexOf("</p>"));

    expect(overlineTag).toContain("uppercase");
    expect(overlineTag).toContain("var(--doc-accent)");
    expect(overlineTag).not.toContain("var(--doc-muted)");
  });

  it("no longer puts the number in a fixed-width gutter beside the title", () => {
    // The gutter was `w-12 shrink-0` on the number's span. If that returns, the header has
    // regressed to the table-of-contents layout regardless of what else still passes.
    const html = render();

    expect(html).not.toContain("w-12 shrink-0");
  });

  it("keeps the title on the display face so it can take the theme's bold weight", () => {
    // `doc-serif` carries BOTH family and `font-weight: var(--doc-display-weight)`, which is how
    // the editable <textarea> and the read-only <h2> end up at the same weight — a textarea
    // inherits neither, so it previously rendered 400 while the h2 rendered the theme weight.
    const html = render();

    expect(html).toMatch(/<h2[^>]*class="[^"]*doc-serif/);
  });
});
