import { describe, expect, it } from "vitest";
import { runSocialMarketingChecks } from "../social-marketing";
import type { ExtendedCheckContext } from "../_types";

function context(html: string, platform = "MARKETING_SITE"): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform,
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}
const find = async (html: string, key: string) =>
  (await runSocialMarketingChecks(context(html))).find((c) => c.checkKey === key)!;

describe("social_og_title counts what a reader sees", () => {
  it("counts &amp; as one character (flipkart: 77 visible, not 81)", async () => {
    const c = await find(
      `<meta property="og:title" content="Online Shopping India Mobile, Cameras, Lifestyle &amp; more Online @ Flipkart.com">`,
      "social_og_title",
    );
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("77 characters");
  });

  it("does not warn on a 66-character title that only looks long because of entities", async () => {
    const title = "Build &amp; ship faster &mdash; the platform for teams &amp; startups";
    const c = await find(`<meta property="og:title" content="${title}">`, "social_og_title");
    expect(c.status).toBe("PASS");
  });

  it("does not truncate a title at an apostrophe, so a long one still warns", async () => {
    const title = "Don't let your next launch slip: the production readiness scanner that tells you what it could not see";
    const c = await find(`<meta property="og:title" content="${title}">`, "social_og_title");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain(`${title.length} characters`);
  });

  it("still passes a normal title (github.com, 61 chars)", async () => {
    const c = await find(
      `<meta property="og:title" content="GitHub · Build and ship software on a single, collaborative pl">`,
      "social_og_title",
    );
    expect(c.status).toBe("PASS");
  });
});

describe("social_og_image_size does not overstate tiny shortfalls", () => {
  const img = (w: number, h: number) => `
    <meta property="og:image" content="https://example.test/card.png">
    <meta property="og:image:width" content="${w}">
    <meta property="og:image:height" content="${h}">`;

  it("passes 1200×627 and 1185×1200 (within a few pixels)", async () => {
    expect((await find(img(1200, 627), "social_og_image_size")).status).toBe("PASS");
    expect((await find(img(1185, 1200), "social_og_image_size")).status).toBe("PASS");
  });

  it("still warns on genuinely small images (supabase 800×600, MDN 1024×1024)", async () => {
    const a = await find(img(800, 600), "social_og_image_size");
    expect(a.status).toBe("WARN");
    expect(a.detail).toContain("800×600");
    expect((await find(img(1024, 1024), "social_og_image_size")).status).toBe("WARN");
  });

  it("the ratio check still flags the 1185×1200 square", async () => {
    expect((await find(img(1185, 1200), "social_og_image_ratio")).status).toBe("WARN");
  });
});

describe("social_og_type wording", () => {
  it("no longer claims `website` earns an article card", async () => {
    const c = await find(`<meta name="og:title" content="MDN Web Docs">`, "social_og_type");
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/richer article card/);
    expect(c.detail).toMatch(/website/);
  });

  it("still passes a declared type", async () => {
    const c = await find(`<meta property="og:type" content="website">`, "social_og_type");
    expect(c.status).toBe("PASS");
  });
});

describe("social_schema_sameas wording", () => {
  it("does not claim existing Organization JSON-LD when there is none (obsidian.md)", async () => {
    const c = await find(`<a href="https://x.com/obsdmd">X</a><a href="https://www.youtube.com/@obsdmd">YouTube</a>`, "social_schema_sameas");
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/you already have/);
    expect(c.detail).toMatch(/no JSON-LD yet/);
  });

  it("keeps the 'already have' wording when Organization JSON-LD exists without sameAs", async () => {
    const c = await find(
      `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Allbirds"}</script><a href="https://www.instagram.com/allbirds">IG</a>`,
      "social_schema_sameas",
    );
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/you already have/);
  });

  it("PASS with no profiles does not say profiles are linked (gov.uk)", async () => {
    const c = await find(`<html><body><h1>Welcome to GOV.UK</h1></body></html>`, "social_schema_sameas");
    expect(c.status).toBe("PASS");
    expect(c.detail).not.toMatch(/Profiles are linked/);
  });

  it("still passes when sameAs is declared (gymshark)", async () => {
    const c = await find(
      `<script type="application/ld+json">{"@type":"Organization","name":"Gymshark","sameAs":["https://www.instagram.com/gymshark/"]}</script><a href="https://www.instagram.com/gymshark/">IG</a>`,
      "social_schema_sameas",
    );
    expect(c.status).toBe("PASS");
  });
});

describe("social_schema_sameas recognises Organization subtypes", () => {
  it("treats LocalBusiness / OnlineStore JSON-LD as the Organization block you already have", async () => {
    for (const type of ["LocalBusiness", "OnlineStore", "ClothingStore"]) {
      const c = await find(
        `<script type="application/ld+json">{"@type":"${type}","name":"Acme"}</script><a href="https://www.instagram.com/acme">IG</a>`,
        "social_schema_sameas",
      );
      expect(c.status).toBe("WARN");
      expect(c.detail).toMatch(/you already have/);
    }
  });

  it("a non-organization JSON-LD type does not read as Organization", async () => {
    const c = await find(
      `<script type="application/ld+json">{"@type":"WebSite","name":"Acme"}</script><a href="https://www.instagram.com/acme">IG</a>`,
      "social_schema_sameas",
    );
    expect(c.detail).not.toMatch(/you already have/);
    expect(c.detail).not.toMatch(/no JSON-LD/);
  });

  it("an unrecognised Organization subtype (Dentist, School) is not told it has no Organization block", async () => {
    for (const type of ["Dentist", "School"]) {
      const c = await find(
        `<script type="application/ld+json">{"@type":"${type}","name":"Acme"}</script><a href="https://www.instagram.com/acme">IG</a>`,
        "social_schema_sameas",
      );
      expect(c.status).toBe("WARN");
      expect(c.detail).not.toMatch(/no Organization JSON-LD|no JSON-LD/);
    }
  });
});
