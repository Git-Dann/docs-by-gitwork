import { describe, expect, it } from "vitest";
import {
  isSafeLinkUrl,
  labelFromUrl,
  MAX_PLATFORM_LINKS,
  normalisePlatformLinks,
} from "../platform-links";

/**
 * Extra platform links are typed by one person and clicked by another, months
 * later, from a card in Portal. So the rule that matters is the scheme: a stored
 * `javascript:` or `data:` URL rendered as an anchor is script execution on click.
 */

describe("isSafeLinkUrl", () => {
  it.each(["https://app.clickup.com/1234/v/b/abc", "http://status.example.com"])(
    "allows %s",
    (u) => expect(isSafeLinkUrl(u)).toBe(true),
  );

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "file:///etc/passwd",
    "vbscript:msgbox",
    "not a url",
    "",
    "   ",
  ])("rejects %s", (u) => expect(isSafeLinkUrl(u)).toBe(false));

  it("rejects null and undefined", () => {
    expect(isSafeLinkUrl(null)).toBe(false);
    expect(isSafeLinkUrl(undefined)).toBe(false);
  });
});

describe("labelFromUrl", () => {
  it("falls back to the hostname, without www", () => {
    expect(labelFromUrl("https://www.clickup.com/board/1")).toBe("clickup.com");
    expect(labelFromUrl("https://app.clickup.com/x")).toBe("app.clickup.com");
  });

  it("never throws on rubbish", () => {
    expect(labelFromUrl("nonsense")).toBe("Link");
  });
});

describe("normalisePlatformLinks", () => {
  it("keeps good rows and drops unusable ones", () => {
    expect(
      normalisePlatformLinks([
        { label: "ClickUp", url: "https://app.clickup.com/b/1" },
        { label: "Evil", url: "javascript:alert(1)" },
        { label: "Half typed", url: "" },
        null,
        "nope",
      ]),
    ).toEqual([{ label: "ClickUp", url: "https://app.clickup.com/b/1" }]);
  });

  it("names an unlabelled link after its host rather than leaving it blank", () => {
    expect(normalisePlatformLinks([{ url: "https://app.clickup.com/b/1" }])).toEqual([
      { label: "app.clickup.com", url: "https://app.clickup.com/b/1" },
    ]);
  });

  it("returns [] for anything that isn't an array — the column predates the field", () => {
    for (const junk of [null, undefined, {}, "", 5, true]) {
      expect(normalisePlatformLinks(junk)).toEqual([]);
    }
  });

  it("caps the list so one client can't make the card unbounded", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      label: `L${i}`,
      url: `https://example.com/${i}`,
    }));
    expect(normalisePlatformLinks(many)).toHaveLength(MAX_PLATFORM_LINKS);
  });

  it("trims and truncates a runaway label", () => {
    const [link] = normalisePlatformLinks([
      { label: "  " + "x".repeat(200) + "  ", url: "https://example.com" },
    ]);
    expect(link.label.length).toBe(60);
  });
});
