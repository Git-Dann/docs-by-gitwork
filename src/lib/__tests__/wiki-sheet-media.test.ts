/**
 * Media cells (§73.1): what a link IS is read from the URL alone, an embed URL is BUILT from a
 * parsed id on an allow-listed host (never the user's URL), and anything that isn't http(s)
 * never becomes a value. Hostile inputs first, because those are the ones that matter.
 */
import { describe, expect, it } from "vitest";
import {
  EMBED_ORIGINS,
  coerceMedia,
  mediaEmbedUrl,
  mediaKind,
  mediaTitle,
  splitMediaText,
} from "@/lib/wiki-sheet-media";
import { cellText, coerceCellValue, exportSheet, parseRowCells, planImport, rowTaskDescription } from "@/lib/wiki-sheets";
import type { SheetColumn } from "@/types/wiki-sheets";

const MEDIA: SheetColumn = { id: "m", title: "Media", type: "media", clientEditable: true };

describe("hostile links never become values, kinds or embeds", () => {
  const hostile = [
    "javascript:alert(1)",
    "javascript://youtube.com/%0aalert(1)",
    "data:image/png;base64,iVBORw0KGgo=",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ];
  it.each(hostile)("%s is refused", (url) => {
    expect(coerceMedia(url).ok).toBe(false);
    expect(mediaKind(url)).toBeNull();
    expect(mediaEmbedUrl(url)).toBeNull();
  });

  it("a lookalike host is not YouTube, Vimeo or Loom — and gets no embed", () => {
    for (const url of [
      "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
      "https://evil-youtube.com/watch?v=dQw4w9WgXcQ",
      "https://notyoutu.be/dQw4w9WgXcQ",
      "https://vimeo.com.attacker.io/76979871",
      "https://loom.com.attacker.io/share/0123456789abcdef0123456789abcdef",
      "https://attacker.io/?u=https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      expect(mediaEmbedUrl(url), url).toBeNull();
      expect(["youtube", "vimeo", "loom"]).not.toContain(mediaKind(url));
    }
  });

  it("an id that isn't the right shape gets no embed (no path or query smuggled into the src)", () => {
    expect(mediaEmbedUrl("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(mediaEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ%22onload")).toBeNull();
    expect(mediaEmbedUrl("https://youtu.be/../../evil")).toBeNull();
    expect(mediaEmbedUrl("https://vimeo.com/channels/staffpicks")).toBeNull();
    expect(mediaEmbedUrl("https://www.loom.com/share/not-hex!")).toBeNull();
  });
});

describe("kinds and embeds for the real thing", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://vimeo.com/76979871", "vimeo", "https://player.vimeo.com/video/76979871"],
    ["https://vimeo.com/76979871/abc123def0", "vimeo", "https://player.vimeo.com/video/76979871?h=abc123def0"],
    ["https://www.loom.com/share/0123456789abcdef0123456789abcdef", "loom", "https://www.loom.com/embed/0123456789abcdef0123456789abcdef"],
  ])("%s → %s", (url, kind, embed) => {
    expect(mediaKind(url)).toBe(kind);
    expect(mediaEmbedUrl(url)).toBe(embed);
    expect(EMBED_ORIGINS.some((o) => embed.startsWith(`${o}/`))).toBe(true);
  });

  it("files, images, video files, Drive and Figma are recognised but never embedded", () => {
    expect(mediaKind("https://cdn.example.com/a/Hero%20shot.PNG")).toBe("image");
    expect(mediaKind("https://cdn.example.com/clip.mp4")).toBe("video");
    expect(mediaKind("https://drive.google.com/file/d/abc/view")).toBe("drive");
    expect(mediaKind("https://www.figma.com/file/abc/Design")).toBe("figma");
    expect(mediaKind("https://example.com/brief.pdf")).toBe("file");
    for (const u of ["https://cdn.example.com/clip.mp4", "https://drive.google.com/file/d/abc/view"]) expect(mediaEmbedUrl(u)).toBeNull();
  });

  it("a tidy title — the given one, else derived; never the raw long URL", () => {
    expect(mediaTitle({ url: "https://cdn.example.com/a/Hero%20shot.PNG" })).toBe("Hero shot.PNG");
    expect(mediaTitle({ url: "https://youtu.be/dQw4w9WgXcQ" })).toBe("YouTube video");
    expect(mediaTitle({ url: "https://www.loom.com/share/0123456789abcdef0123456789abcdef" })).toBe("Loom recording");
    expect(mediaTitle({ url: "https://drive.google.com/file/d/abc/view" })).toBe("Google Drive file");
    expect(mediaTitle({ url: "https://example.com/" })).toBe("example.com");
    expect(mediaTitle({ url: "https://x.com/y", title: "  Brand video  " })).toBe("Brand video");
  });
});

describe("values", () => {
  it("accepts a URL, several separated by spaces/commas, an array, or {url,title} objects; de-duplicates", () => {
    expect(splitMediaText("https://a.com/1.png, https://a.com/2.png\nwww.b.com/c.mp4")).toEqual([
      "https://a.com/1.png",
      "https://a.com/2.png",
      "www.b.com/c.mp4",
    ]);
    const res = coerceCellValue(MEDIA, [{ url: "https://a.com/1.png", title: "One" }, "https://a.com/1.png", "a.com/2.png"]);
    expect(res).toEqual({ ok: true, value: [{ url: "https://a.com/1.png", title: "One" }, { url: "https://a.com/2.png" }] });
    expect(coerceCellValue(MEDIA, "")).toEqual({ ok: true, value: null });
  });

  it("caps a cell at 10 links, in words", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `https://a.com/${i}.png`);
    const res = coerceMedia(eleven, '"Media"');
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/at most 10/);
  });

  it("a stored list re-parses; a stored hostile URL is dropped rather than drawn", () => {
    expect(parseRowCells({ m: [{ url: "javascript:alert(1)" }] }, [MEDIA])).toEqual({});
  });

  it("CSV writes the URLs; paste reads them back", () => {
    const rows = [{ cells: { m: [{ url: "https://a.com/1.png" }, { url: "https://youtu.be/dQw4w9WgXcQ" }] } }];
    const csv = exportSheet([MEDIA], rows, ",");
    expect(csv).toContain("https://a.com/1.png https://youtu.be/dQw4w9WgXcQ");
    const plan = planImport([["Media"], ["https://a.com/1.png https://youtu.be/dQw4w9WgXcQ"]], [MEDIA], {
      firstRowHeaders: true,
      allowNewColumns: false,
    });
    expect(plan.rows[0].m).toEqual([{ url: "https://a.com/1.png" }, { url: "https://youtu.be/dQw4w9WgXcQ" }]);
    expect(cellText(MEDIA, plan.rows[0].m)).toBe("https://a.com/1.png https://youtu.be/dQw4w9WgXcQ");
  });

  it("a task description carries the links as real markdown links", () => {
    const desc = rowTaskDescription(
      { title: "S", columns: [{ id: "t", title: "Item", type: "text", clientEditable: true }, MEDIA], titleColumnId: "t" },
      { t: "Hero", m: [{ url: "https://a.com/x_(1).png", title: "Hero [final]" }] },
      null,
    );
    expect(desc).toContain("**Media:**\n- [Hero final](https://a.com/x_%281%29.png)");
  });
});
