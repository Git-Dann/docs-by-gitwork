// @vitest-environment node
/**
 * A page check speaks only when it read a page that names itself. Fixtures are the shapes
 * the live sites returned on 2026-10-14 (title + first heading, verbatim).
 */
import { describe, expect, it } from "vitest";
import { classifyTopicPage, combinePageStates, pageTitle, type PathProbe } from "@/server/pulse-checks/path-probe";

const page = (title: string, h1 = "", finalUrl = "https://site.test/x", status = 200): PathProbe => ({
  status,
  contentType: "text/html; charset=utf-8",
  body: `<!doctype html><html><head><title lang="en">${title}</title></head><body><h1>${h1}</h1></body></html>`,
  finalUrl,
});
const HOME = "vercel: build and deploy the best web experiences";

describe("a soft-routed path is never reported as the page", () => {
  it("vercel.com serving its homepage for /dpa-shaped paths is unverified, not present", () => {
    const p = page("Vercel: Build and deploy the best web experiences", "", "https://vercel.com/accessibility");
    expect(classifyTopicPage(p, "/accessibility", /accessibilit/i, HOME)).toBe("unverified");
  });
  it("a homepage whose title happens to contain the topic word is still unverified", () => {
    const home = "acme docs";
    expect(classifyTopicPage(page("Acme Docs", "", "https://a.test/docs"), "/docs", /\bdocs?\b/i, home)).toBe("unverified");
  });
  it("cbc.ca's 'Menu' page served for an unknown path is unverified", () => {
    expect(classifyTopicPage(page("Menu"), "/dpa", /\bdpa\b|data processing/i, "cbc")).toBe("unverified");
  });
  it("a redirect back to the homepage means the page is absent", () => {
    expect(classifyTopicPage(page("Home", "", "https://site.test/"), "/careers", /careers?/i, "home")).toBe("absent");
  });
});

describe("a real page that names itself is found", () => {
  const cases: Array<[string, PathProbe, string, RegExp]> = [
    ["gov.uk cookies", page("Cookies on GOV.UK - GOV.UK", "", "https://www.gov.uk/help/cookies"), "/help/cookies", /cookie/i],
    ["vercel /about", page("About Us", "Vercel frees the world to ship what’s next", "https://vercel.com/about"), "/about", /\babout\b/i],
    ["linear careers (entity in title)", page("We&#x27;re hiring – Linear", "Help us craft", "https://linear.app/careers"), "/careers", /hiring/i],
    ["vercel /dpa redirected to /legal/dpa", page("Data Processing Addendum", "Data Processing Addendum", "https://vercel.com/legal/dpa"), "/dpa", /data processing/i],
  ];
  for (const [name, p, path, topic] of cases) {
    it(name, () => expect(classifyTopicPage(p, path, topic, HOME)).toBe("present"));
  }
  it("a redirect to a path that names the topic counts even with a generic title", () => {
    expect(classifyTopicPage(page("Acme", "", "https://a.test/legal/cookie-policy"), "/cookies", /cookie/i, "acme home")).toBe("present");
  });
});

describe("status codes", () => {
  it("404 and 410 are absent", () => {
    expect(classifyTopicPage(page("Page not found", "", "https://x.test/cookies", 404), "/cookies", /cookie/i, null)).toBe("absent");
    expect(classifyTopicPage(page("Gone", "", "https://x.test/cookies", 410), "/cookies", /cookie/i, null)).toBe("absent");
  });
  it("a bot wall (403) is unverified, never absent", () => {
    expect(classifyTopicPage(page("Just a moment...", "", "https://x.test/accessibility", 403), "/accessibility", /accessibilit/i, null)).toBe("unverified");
  });
  it("a failed request is failed", () => {
    expect(classifyTopicPage({ status: 0, contentType: "", body: "" }, "/about", /about/i, null)).toBe("failed");
  });
});

describe("combining candidate paths", () => {
  it("present wins, then unverified, then failed, then absent", () => {
    expect(combinePageStates("absent", "present")).toBe("present");
    expect(combinePageStates("absent", "unverified")).toBe("unverified");
    expect(combinePageStates("absent", "failed")).toBe("failed");
    expect(combinePageStates("absent", "absent")).toBe("absent");
  });
  it("pageTitle reads a title with attributes and entities", () => {
    expect(pageTitle('<title lang="en">We&#x27;re hiring</title>')).toBe("we re hiring");
  });
});
