import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QRCode from "qrcode";
import { CARD_COLOURS, DEFAULT_CARD, contrastRatio, readCard } from "@/lib/profile-card";
import { CardFace, QrCode } from "@/components/profile/profile-card";
import { PublicProfileView } from "@/components/profile/public-profile-view";
import { DEMO_PUBLIC_PROFILE } from "@/lib/demo/demo-public-profile";

const person = { name: "Priya Shah", headline: "Senior Product Engineer", company: "Gitwork", location: "Manchester, UK", avatarUrl: null };

describe("business card rules", () => {
  it("whatever is stored reads as a card that can be drawn", () => {
    expect(readCard(null)).toEqual(DEFAULT_CARD);
    expect(readCard("nope")).toEqual(DEFAULT_CARD);
    expect(readCard({ layout: "photo-side", font: "comic-sans", colour: "<script>", pattern: "rings" })).toEqual({
      ...DEFAULT_CARD,
      layout: "photo-side",
      pattern: "rings",
    });
  });

  it("every colour keeps its text readable (AA, 4.5:1)", () => {
    for (const c of CARD_COLOURS) expect(contrastRatio(c.bg, c.fg), c.id).toBeGreaterThanOrEqual(4.5);
  });
});

describe("drawing it", () => {
  it("the face shows the name, headline, company and location", () => {
    const html = renderToStaticMarkup(React.createElement(CardFace, { card: DEFAULT_CARD, person }));
    for (const s of ["Priya Shah", "Senior Product Engineer", "Gitwork · Manchester, UK"]) expect(html).toContain(s);
  });

  it("the QR code encodes the page address, drawn from the library's own modules", () => {
    const url = "https://foundry.gitwork.co.uk/u/priya-shah";
    const html = renderToStaticMarkup(React.createElement(QrCode, { value: url }));
    const m = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
    let dark = 0;
    for (let i = 0; i < m.data.length; i++) dark += m.data[i] ? 1 : 0;
    expect((html.match(/h1v1h-1z/g) ?? []).length).toBe(dark);
  });

  it("a page with a card draws it, keeps an h1, and drops the plain band", () => {
    const html = renderToStaticMarkup(React.createElement(PublicProfileView, { profile: DEMO_PUBLIC_PROFILE }));
    expect(html).toContain("Turn the card over for a QR code");
    expect(html).toMatch(/<h1 class="sr-only">Priya Shah<\/h1>/);
    expect(html).toContain("/u/priya-shah");
  });

  it("a page without one keeps the plain header", () => {
    const html = renderToStaticMarkup(React.createElement(PublicProfileView, { profile: { ...DEMO_PUBLIC_PROFILE, card: null } }));
    expect(html).not.toContain("Turn the card over");
    expect(html).toMatch(/<h1[^>]*>Priya Shah/);
  });
});
