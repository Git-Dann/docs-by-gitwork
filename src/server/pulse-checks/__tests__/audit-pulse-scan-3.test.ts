import { describe, expect, it } from "vitest";
import {
  DEMO_BOOKING_PATTERN,
  DPA_LINK_TOKENS,
  FAQ_LINK_TOKENS,
  FREE_PLAN_PATTERN,
  fontDisplayVerdict,
  googlePlaySignal,
  hasEuDataResidencySignal,
  linksPathContaining,
} from "@/server/pulse-scan";
import {
  boundedDmarcCandidates,
  organizationalDomainCandidates,
} from "@/server/pulse-lite/registrable-domain";

// Inputs are trimmed from live fetches on 2026-10-14 (audit packet pulse-scan-3).

describe("dmarc_record: platform namespaces that are not on the Public Suffix List", () => {
  it("falls back to squarespace.com for www.squarespace.com (_dmarc.squarespace.com is p=reject)", () => {
    expect(boundedDmarcCandidates(organizationalDomainCandidates("www.squarespace.com"))).toEqual(["squarespace.com"]);
    expect(organizationalDomainCandidates("someblog.wordpress.com")).toEqual(["wordpress.com"]);
  });

  it("does not fall back across real PSL entries, and leaves ordinary hosts alone", () => {
    expect(organizationalDomainCandidates("nextjs-boilerplate-five-plum-29.vercel.app")).toEqual([]);
    expect(organizationalDomainCandidates("shop.myshopify.com")).toEqual([]);
    expect(organizationalDomainCandidates("www.cbc.ca")).toEqual(["cbc.ca"]);
  });
});

describe("demo_booking / demo_booking_signal", () => {
  it("does not read cal.com inside another domain", () => {
    expect(DEMO_BOOKING_PATTERN.test('<a href="https://www.tropical.com/">Tropical</a>')).toBe(false);
    expect(DEMO_BOOKING_PATTERN.test('<a href="https://cal.com/acme/30min">Book time</a>')).toBe(true);
  });

  it("recognises the CTAs vercel.com, www.notion.so and linear.app actually use", () => {
    expect(DEMO_BOOKING_PATTERN.test('<a href="/contact/sales/demo">Get a Demo</a>')).toBe(true);
    expect(DEMO_BOOKING_PATTERN.test('<a href="/contact-sales">Request a demo</a>')).toBe(true);
    expect(DEMO_BOOKING_PATTERN.test('<a href="/contact/sales">Contact sales</a>')).toBe(true);
    expect(DEMO_BOOKING_PATTERN.test("<a>Book a demo</a>")).toBe(true);
  });

  it("does not invent a sales path on a self-serve page", () => {
    expect(DEMO_BOOKING_PATTERN.test('<p>Try it out and start building for free</p><a href="/pricing">Pricing</a>')).toBe(false);
    expect(DEMO_BOOKING_PATTERN.test("<p>Our demo video shows the sales dashboard.</p>")).toBe(false);
  });
});

describe("free_trial_cta", () => {
  it("recognises free-plan CTAs worded around a verb", () => {
    expect(FREE_PLAN_PATTERN.test("<p>try it out and start building for free</p>")).toBe(true);
    expect(FREE_PLAN_PATTERN.test('<meta name="description" content="use linear for free with your whole team.">')).toBe(true);
    expect(FREE_PLAN_PATTERN.test("<a>start for free</a>")).toBe(true);
  });

  it("does not count an unrelated 'for free' as a free plan", () => {
    expect(FREE_PLAN_PATTERN.test('<span class="truncate">stream online for free</span>')).toBe(false);
    expect(FREE_PLAN_PATTERN.test("<a>start deploying</a><a>get a demo</a>")).toBe(false);
  });
});

describe("eu_data_residency", () => {
  it("sees posthog.com's EU region selector and figma's EU hosting link", () => {
    expect(hasEuDataResidencySignal('<button class="border-black">eu (frankfurt)</button>')).toBe(true);
    expect(hasEuDataResidencySignal('<a href="/blog/eu-hosting-for-figma-and-figjam-files/">')).toBe(true);
  });

  it("does not treat a mere mention of the EU as residency", () => {
    expect(hasEuDataResidencySignal("<p>we serve customers in the eu and the us.</p>")).toBe(false);
  });
});

describe("google_play_store", () => {
  it("separates a Play link from an Android declaration", () => {
    expect(googlePlaySignal('<a href="https://play.google.com/store/apps/details?id=de.zalando.mobile">')).toBe("link");
    expect(googlePlaySignal('<script type="application/ld+json">{"@type":"SoftwareApplication","operatingSystem":"Web, macOS, Windows, iOS, Android"}</script>')).toBe("declared");
  });

  it("does not read an android-chrome favicon as an Android app", () => {
    expect(googlePlaySignal('<link href="https://assets.targetimg1.com/static/images/android-chrome-192x192.png" rel="icon">')).toBeNull();
    expect(googlePlaySignal('<script type="application/ld+json">{"operatingSystem":"Web, macOS, Windows"}</script>')).toBeNull();
  });
});

describe("font_display_swap", () => {
  it("does not claim a missing font-display when the fonts live in an external stylesheet", () => {
    expect(fontDisplayVerdict('<link rel="stylesheet" href="/vc-ap-vercel-marketing/_next/static/immutable/chunks/2y9c8z4abk3c0.css"><h1>Vercel</h1>')).toBe("INCONCLUSIVE");
  });

  it("passes non-blocking values and still warns on blocking fonts declared in the page", () => {
    expect(fontDisplayVerdict("<style>@font-face{font-family:GDS;src:url(/f.woff2);font-display:fallback}</style>")).toBe("PASS");
    expect(fontDisplayVerdict('<link href="https://fonts.googleapis.com/css2?family=Inter&amp;display=swap" rel="stylesheet">')).toBe("PASS");
    expect(fontDisplayVerdict("<style>@font-face{font-family:Inter;src:url(/i.woff2)}</style>")).toBe("WARN");
    expect(fontDisplayVerdict('<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">')).toBe("WARN");
  });
});

describe("faq_page / dpa_available link evidence", () => {
  it("counts the help centre a page links to (vercel.com, uk.gymshark.com)", () => {
    expect(linksPathContaining('<a href="/help">Help</a>', FAQ_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="https://support.gymshark.com/en-US">Help</a>', FAQ_LINK_TOKENS)).toBe(true);
  });

  it("does not count unrelated links as a help page", () => {
    expect(linksPathContaining('<a href="https://expired.badssl.com/">expired</a><a href="/docs/supported-browsers">Browsers</a>', FAQ_LINK_TOKENS)).toBe(false);
  });

  it("does not count help-ish words inside other paths", () => {
    expect(linksPathContaining('<a href="/blog/how-we-help-startups">Blog</a>', FAQ_LINK_TOKENS)).toBe(false);
    expect(linksPathContaining('<a href="/helpers">Helpers</a><a href="/self-help">Guide</a>', FAQ_LINK_TOKENS)).toBe(false);
    expect(linksPathContaining('<a href="/faq.html">FAQ</a>', FAQ_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="/help-center">Help</a>', FAQ_LINK_TOKENS)).toBe(true);
  });

  it("counts a linked GDPR DPA (supabase.com /legal/dpa, anthropic.com's addendum) and nothing else", () => {
    expect(linksPathContaining('<a href="/legal/dpa">DPA</a>', DPA_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="/legal/dpa.pdf">DPA</a>', DPA_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="https://www.anthropic.com/legal/data-processing-addendum">DPA</a>', DPA_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="/legal/privacy">Privacy</a><a href="/updates">Updates</a>', DPA_LINK_TOKENS)).toBe(false);
  });

  it("does not count a US K-12 student-data agreement or a privacy-notice section as a GDPR DPA", () => {
    // anthropic.com/legal/k12-dpa is titled "U.S. K-12 Data Processing Agreement".
    expect(linksPathContaining('<a href="https://anthropic.com/legal/k12-dpa">K-12 DPA</a>', DPA_LINK_TOKENS)).toBe(false);
    expect(linksPathContaining('<a href="/privacy/data-processing">How we process data</a>', DPA_LINK_TOKENS)).toBe(false);
  });
});
