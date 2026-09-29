import { describe, expect, it } from "vitest";
import { buildCvData } from "../build-cv";
import { DELIVERY_LINE, esc, renderCvHtml } from "../render-cv";

const render = (over: Parameters<typeof buildCvData>[0] | null = null) =>
  renderCvHtml(
    buildCvData(
      over ?? {
        name: "Alice Fernandez",
        primaryStack: "React Native",
        bio: "A bio.",
        githubHandle: "alicef",
      },
    ),
    { fontCss: "@font-face{}", markDataUri: "data:image/png;base64,AAA" },
  );

/** The Gitwork Document System's rules, as rules rather than as good intentions. */
describe("Gitwork Document System compliance", () => {
  it("carries the delivery line word for word", () => {
    // Required on anything a client, prospect or the public will see, and a CV
    // handed to a client is exactly that.
    expect(render()).toContain(DELIVERY_LINE);
    expect(DELIVERY_LINE).toBe(
      "Global build capacity, UK quality control. Every release is reviewed and deployed by a UK based senior engineer.",
    );
  });

  it("contains no em dash anywhere", () => {
    const html = render({
      name: "Alice",
      primaryStack: "Go",
      githubHandle: "a",
      bio: "One thing. Another thing.",
    });
    expect(html).not.toContain("—");
  });

  it("never sets the wordmark in a font", () => {
    // "The wordmark is always a placed asset. Never set 'Gitwork.' in a font, in
    // anything." The head carries the placed mark; the foot carries the URL, which
    // is the system's own `label` sample.
    const html = render();
    expect(html).toContain('class="mark" src="data:image/png');
    expect(html).toContain("gitwork.co.uk");
    expect(html).not.toMatch(/>\s*Gitwork\.?\s*</);
  });

  it("omits the mark rather than drawing a broken image when it is unavailable", () => {
    const html = renderCvHtml(
      buildCvData({ name: "A", primaryStack: "Go", githubHandle: "a" }),
      { fontCss: "", markDataUri: null },
    );
    expect(html).not.toContain("<img");
  });

  it("uses only the four permitted families", () => {
    const html = render();
    const families = [...html.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1]);
    expect(families.length).toBeGreaterThan(0);
    for (const f of families) {
      expect(f).toMatch(/Inter|Fraunces|JetBrains Mono|Playfair Display/);
    }
  });

  it("is one page: a fixed 1000 x 1414 box", () => {
    const html = render();
    expect(html).toMatch(/width:\s*1000px/);
    expect(html).toMatch(/height:\s*1414px/);
  });

  it("renders no empty section on a sparse profile", () => {
    // An empty heading reads as a broken document rather than a short one.
    const html = renderCvHtml(
      buildCvData({ name: "Sam", primaryStack: "Go", githubHandle: "s" }),
      { fontCss: "", markDataUri: null },
    );
    expect(html).not.toContain("Profile");
    expect(html).not.toContain("Selected work");
    expect(html).toContain("Stack");
  });

  it("escapes candidate-supplied text", () => {
    // Every string on this page comes from a profile someone typed.
    const html = renderCvHtml(
      buildCvData({
        name: '<script>alert(1)</script>',
        primaryStack: "Go & Rust",
        githubHandle: "x",
      }),
      { fontCss: "", markDataUri: null },
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Go &amp; Rust");
  });

  it("esc covers the four characters that matter in an attribute or a body", () => {
    expect(esc('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});
