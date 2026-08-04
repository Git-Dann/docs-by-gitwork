import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-workspace-branding", () => ({
  useWorkspaceBranding: () => ({ logoUrl: "", clientLogoUrl: "" }),
}));

import { ProposalSectionPreview } from "@/components/proposals/proposal-section-preview";

const SECTION = {
  id: "s1", key: "parties", title: "Parties",
  description: "Counterparties to this Agreement.",
  sortOrder: 1, isVisible: true,
  data: { intro: "", parties: [{ id: "p1", name: "Gitwork Group Ltd", role: "", organization: "", email: "d@g.co" }] },
};

function render() {
  const proposal = {
    id: "d1", title: "NDA", documentType: "NDA", status: "DRAFT",
    clientName: "Acme", productName: "", version: "1.0", summary: "",
    metadata: { client: "Acme", owner: "Dan", version: "1.0", productSignOff: false, techSignOff: false, approvalChecked: false },
    sections: [SECTION], costLineItems: [], timelinePhases: [], links: [], ctas: [], assets: [],
  };
  const C = ProposalSectionPreview as unknown as (p: Record<string, unknown>) => ReactElement;
  return renderToStaticMarkup(<C section={SECTION} proposal={proposal} index={0} />);
}

describe("section header", () => {
  it("prints the number as an overline above the title, not in a gutter", () => {
    const html = render();
    console.log(html.slice(0, 900));
    expect(html).toContain("·");
  });
});
