import { describe, expect, it } from "vitest";
import { embedFor } from "@/lib/wiki/embed";

/**
 * ⚠️ The dangerous direction here is FALSE POSITIVES, not misses. Anything this
 * returns becomes an `<iframe src>` inside a client-facing wiki, so the tests
 * that matter most are the ones asserting it stays QUIET — on other schemes, on
 * lookalike hostnames, and on anything it does not actually recognise.
 */
describe("embedFor — the providers", () => {
  it("turns a Loom share link into its player", () => {
    expect(embedFor("https://www.loom.com/share/abc123DEF")?.src).toBe(
      "https://www.loom.com/embed/abc123DEF",
    );
  });

  it("accepts a Loom embed URL that is already embeddable", () => {
    // Somebody pasting the embed form must not be told it is unknown.
    expect(embedFor("https://loom.com/embed/abc123DEF")?.src).toBe(
      "https://www.loom.com/embed/abc123DEF",
    );
  });

  it("strips Loom's query string rather than passing it through", () => {
    // `?t=120&sid=…` on the share URL is not valid on the embed path.
    expect(embedFor("https://www.loom.com/share/abc123DEF?t=120&sid=x")?.src).toBe(
      "https://www.loom.com/embed/abc123DEF",
    );
  });

  it("uses youtube-nocookie, because this renders on a CLIENT's page", () => {
    // The standard domain sets third-party tracking cookies on our page.
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      expect(embedFor(url)?.src, url).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }
  });

  it("handles Vimeo, Figma and Google", () => {
    expect(embedFor("https://vimeo.com/123456789")?.provider).toBe("Vimeo");
    expect(embedFor("https://www.figma.com/design/abc/Board")?.provider).toBe("Figma");
    expect(embedFor("https://drive.google.com/file/d/ABC-123/view")?.src).toBe(
      "https://drive.google.com/file/d/ABC-123/preview",
    );
    expect(embedFor("https://docs.google.com/document/d/ABC/edit")?.src).toBe(
      "https://docs.google.com/document/d/ABC/preview",
    );
  });

  it("a Google Slides deck embeds rather than previews, and is wide", () => {
    const e = embedFor("https://docs.google.com/presentation/d/ABC/edit");
    expect(e?.src).toBe("https://docs.google.com/presentation/d/ABC/embed");
    expect(e?.ratio).toBeCloseTo(16 / 9);
  });
});

describe("embedFor — stays quiet", () => {
  it("refuses any scheme that is not http(s)", () => {
    // A `javascript:` or `data:` URL reaching an iframe src is the whole reason
    // the protocol check exists.
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(embedFor(url), url).toBeNull();
    }
  });

  it("is not fooled by a lookalike hostname", () => {
    // ⚠️ The hostname is matched exactly or as a SUBDOMAIN — never as a substring.
    // `loom.com.evil.test` and `notloom.com` both contain "loom.com".
    for (const url of [
      "https://loom.com.evil.test/share/abc123",
      "https://notloom.com/share/abc123",
      "https://evil.test/www.loom.com/share/abc123",
      "https://youtube.com.evil.test/watch?v=abc123",
    ]) {
      expect(embedFor(url), url).toBeNull();
    }
  });

  it("returns null for a known host on an unknown path", () => {
    // A Loom account page is not a recording; embedding it would show a login.
    expect(embedFor("https://www.loom.com/looms/videos")).toBeNull();
    expect(embedFor("https://www.figma.com/pricing")).toBeNull();
    expect(embedFor("https://docs.google.com/forms/d/ABC/edit")).toBeNull();
  });

  it("returns null for anything else, so it stays a plain link card", () => {
    for (const url of [
      "https://example.com/a-doc.pdf",
      "https://notion.so/some-page",
      "",
      null,
      undefined,
      "not a url at all",
    ]) {
      expect(embedFor(url as string), String(url)).toBeNull();
    }
  });
});
