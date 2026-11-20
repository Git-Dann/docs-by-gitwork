import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileShareCard } from "@/lib/og/profile-share-card";

const base = { name: "Syed Usama Bin Tahir", headline: "CTO at Gitwork", facts: "Gitwork  ·  Islamabad", bg: "#172554", fg: "#DBEAFE", slug: "syed-usama" };

describe("ProfileShareCard", () => {
  it("shows the photo, name, headline and the person's own address", () => {
    const html = renderToStaticMarkup(<ProfileShareCard {...base} photoDataUri="data:image/png;base64,AAAA" />);
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain("Syed Usama Bin Tahir");
    expect(html).toContain("CTO at Gitwork");
    expect(html).toContain("foundry.gitwork.co.uk/u/syed-usama");
    expect(html).toContain("#172554");
  });

  it("falls back to initials, never a broken image, when there's no photo", () => {
    const html = renderToStaticMarkup(<ProfileShareCard {...base} headline={null} photoDataUri={null} />);
    expect(html).not.toContain("<img");
    expect(html).toContain(">SU<");
  });
});
