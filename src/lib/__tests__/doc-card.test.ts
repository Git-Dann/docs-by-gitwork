import { describe, expect, it } from "vitest";
import { docCardClipboard } from "@/lib/doc-card";

const base = { name: "Dan Lindsay", position: "Head of Product", pageUrl: "https://foundry.gitwork.co.uk/u/dan-lindsay", imageUrl: "https://foundry.gitwork.co.uk/u/dan-lindsay/doc-card" };

describe("docCardClipboard", () => {
  it("pastes the card linked to their page, then their name and position", () => {
    const { html, text } = docCardClipboard(base);
    expect(html).toContain('<a href="https://foundry.gitwork.co.uk/u/dan-lindsay"><img src="https://foundry.gitwork.co.uk/u/dan-lindsay/doc-card"');
    expect(html).toContain('alt="Dan Lindsay, Head of Product"');
    expect(html).toContain('<a href="https://foundry.gitwork.co.uk/u/dan-lindsay">Dan Lindsay</a>, Head of Product');
    expect(text).toBe("Dan Lindsay, Head of Product: https://foundry.gitwork.co.uk/u/dan-lindsay");
  });

  it("leaves the position out when there isn't one", () => {
    const { html, text } = docCardClipboard({ ...base, position: null });
    expect(html).toContain(">Dan Lindsay</a>");
    expect(html).not.toContain("</a>,");
    expect(text).toBe("Dan Lindsay: https://foundry.gitwork.co.uk/u/dan-lindsay");
  });

  it("escapes what people typed, so a name can't become markup", () => {
    const { html } = docCardClipboard({ ...base, name: 'Eve "<script>"', position: "R&D <b>lead</b>" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("Eve &quot;&lt;script&gt;&quot;");
    expect(html).toContain("R&amp;D &lt;b&gt;lead&lt;/b&gt;");
  });
});
