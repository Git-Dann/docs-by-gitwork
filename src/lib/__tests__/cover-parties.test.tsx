import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The cover must print the parties a contract binds.
 *
 * This has been reported and "fixed" repeatedly, and each previous attempt was verified against
 * the pure helpers in `parties-text.ts` (which were always correct) or against a `/demo/*` page
 * (which uses a different shell). So this test deliberately drives the REAL section renderer with
 * a REAL section payload and asserts on the rendered markup, because that is the only place all
 * the links in the chain — section lookup, `isVisible`, `toCoverParties`, `coverStripMode`,
 * `CoverBottomStrip` — are exercised together.
 *
 * The party data is the shape that actually occurs in the wild: a `name` and an `email`, with
 * NO `details` array and NO `definedTerm`. Both of those are newer authored fields, so every
 * document created before they existed — and every document created from the NDA template, which
 * seeds `organization` / `email` rather than `details` — looks like this.
 */

// The cover reads workspace branding through a hook; stub it so this stays a pure render test
// with no query client or provider tree.
vi.mock("@/hooks/use-workspace-branding", () => ({
  useWorkspaceBranding: () => ({ logoUrl: "", clientLogoUrl: "" }),
}));

import { coverSection } from "@/lib/sections/cover";

const PARTIES_SECTION = {
  id: "sec-parties",
  key: "parties",
  title: "Parties",
  description: "",
  sortOrder: 1,
  isVisible: true,
  data: {
    intro: "",
    parties: [
      {
        id: "p1",
        name: "Gitwork Group Ltd",
        role: "",
        organization: "",
        email: "dan@gitwork.co.uk",
        signatureRequired: true,
      },
      {
        id: "p2",
        name: "Shuffle Love Ltd",
        role: "",
        organization: "",
        email: "ops@shufflelove.com",
        signatureRequired: true,
      },
    ],
  },
};

const COVER_SECTION = {
  id: "sec-cover",
  key: "cover",
  title: "Cover",
  description: "",
  sortOrder: 0,
  isVisible: true,
  data: {
    proposalTitle: "Mutual Non-Disclosure Agreement",
    productName: "",
    clientName: "Shuffle Love",
    subtitle: "v1.0",
    date: "2026-08-04",
    confidentiality: "Confidential.",
    confidentialityMode: "INTERNAL",
    heroImage: "",
    brandLockup: "GITWORK",
  },
};

function renderCover(
  overrides: Record<string, unknown> = {},
  coverData: Record<string, unknown> = {},
) {
  const proposal = {
    id: "doc-1",
    title: "Mutual Non-Disclosure Agreement",
    documentType: "NDA",
    status: "DRAFT",
    clientName: "Shuffle Love",
    productName: "",
    version: "1.0",
    summary: "",
    // Shaped exactly like `normalizeMetadata` in server/proposals.ts, which always returns an
    // object with these keys defaulted — `metadata` is never null on a serialized proposal, so a
    // null here would be testing a state the app cannot produce.
    metadata: {
      client: "Shuffle Love",
      owner: "Dan Lindsay",
      version: "1.0",
      productSignOff: false,
      techSignOff: false,
      approvalChecked: false,
    },
    sections: [COVER_SECTION, PARTIES_SECTION],
    costLineItems: [],
    timelinePhases: [],
    links: [],
    ctas: [],
    assets: [],
    ...overrides,
  };

  const Preview = coverSection.Preview as unknown as (
    props: Record<string, unknown>,
  ) => ReactElement;

  return renderToStaticMarkup(
    <Preview
      data={{ ...COVER_SECTION.data, ...coverData }}
      proposal={proposal}
      section={COVER_SECTION}
      editable={false}
      onChange={() => {}}
    />,
  );
}

describe("cover — parties", () => {
  it("prints every party's name", () => {
    const html = renderCover();

    expect(html).toContain("Gitwork Group Ltd");
    expect(html).toContain("Shuffle Love Ltd");
  });

  it("prints each party's detail line when there is no `details` array", () => {
    // The back-compat path: pre-`details` documents carry the contact on `email`. If this
    // regresses, a cover renders bare names with no registered office / contact under them.
    const html = renderCover();

    expect(html).toContain("dan@gitwork.co.uk");
    expect(html).toContain("ops@shufflelove.com");
  });

  it("labels unroled parties PARTY A / PARTY B rather than leaving the column headless", () => {
    const html = renderCover();

    expect(html).toContain("Party A");
    expect(html).toContain("Party B");
  });

  it("shows the parties strip INSTEAD of the meta grid", () => {
    // A contract leads with who is bound. If the meta grid wins, the cover has fallen back and
    // the parties are gone — which is the exact symptom being fixed, so assert the swap directly.
    const html = renderCover();

    expect(html).not.toContain("Prepared by");
  });

  it("falls back to the meta grid when the parties section is hidden", () => {
    // The mode decision is data-driven, so hiding the block must return the cover to meta —
    // otherwise "no parties" would render an empty framed box.
    const html = renderCover({
      sections: [COVER_SECTION, { ...PARTIES_SECTION, isVisible: false }],
    });

    expect(html).not.toContain("Gitwork Group Ltd");
  });

  it.each(["minimal", "light", "bold"])(
    "prints the parties on a `%s` cover",
    (coverStyle) => {
      // THE regression. `minimal` used to zero the parties array before `coverStripMode` ever
      // saw it, so every downstream check — pure helpers, mode decision, renderer — was correct
      // and still produced nothing. Documents created before 43506dd6 carry a stored
      // `coverStyle: "minimal"`, and that commit removed the Light/Minimal/Bold control, so they
      // were stranded in it with no UI to change it back. Hence "unfixable" across three passes.
      //
      // `minimal` may drop decoration (covers strip, exec summary, stat tiles). Who is legally
      // bound is not decoration.
      const html = renderCover({}, { coverStyle });

      expect(html).toContain("Gitwork Group Ltd");
      expect(html).toContain("Shuffle Love Ltd");
    },
  );
});
