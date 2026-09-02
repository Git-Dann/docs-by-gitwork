import { describe, expect, it } from "vitest";
import { detectTechStack } from "@/server/pulse-scan";

// ─────────────────────────────────────────────────────────────────────────────
// USE, not MENTION.
//
// Every detection in `detectTechStack` used to be a naked `html.includes("<brand>")`,
// which answers "does this word appear on the page" rather than "is this technology in
// use". On the B2B marketing sites Pulse mostly scans, those differ constantly.
//
// The case that found it, verified outside Pulse with curl: stripe.com 307s to
// stripe.com/gb, whose HTML contains "supabase" 14 times — because Supabase is a
// Stripe CUSTOMER, listed in their case-study carousel. Pulse concluded the site runs
// on Supabase and raised a P2 telling Stripe to verify their Row-Level Security.
//
// This is not cosmetic. techStack feeds `hasBackend` and platform detection, which
// decide WHICH CHECK FAMILIES RUN — so a wrong stack manufactures wrong findings.
// ─────────────────────────────────────────────────────────────────────────────

const noHeaders: Record<string, string> = {};

describe("a brand named on the page is not a brand in use", () => {
  it("does not claim Supabase from a customer logo (the real stripe.com/gb case)", () => {
    const customerCarousel =
      `<div class="case-study-carousel__inner">` +
      `<a class="case-study-card" href="/gb/customers/supabase" data-analytics-label="build_a_foundation__supabase">` +
      `<img src="https://images.stripeassets.com/x/Supabase.png?w=432&amp;fm=webp&amp;q=90"/>` +
      `</a></div>`;
    expect(detectTechStack(noHeaders, customerCarousel)).not.toContain("Supabase");
  });

  it("does not claim Vue from the word 'Avenue' in a postal address", () => {
    const footer = `<footer><address>3 Bellevue Avenue, London</address><p>Our revue of 2026</p></footer>`;
    expect(detectTechStack(noHeaders, footer)).not.toContain("Vue");
  });

  it("does not claim Clerk from the ordinary English word", () => {
    const jobAd = `<h2>We are hiring a payroll clerk</h2><p>Clerkenwell office.</p>`;
    expect(detectTechStack(noHeaders, jobAd)).not.toContain("Clerk");
  });

  it("does not claim React from 'reaction' or 'reactive'", () => {
    const blog = `<article><h1>A reaction to reactive design</h1><p>They reacted well.</p></article>`;
    expect(detectTechStack(noHeaders, blog)).not.toContain("React");
  });

  it("does not claim Stripe merely because the word appears", () => {
    const prose = `<p>We accept payments. Read our Stripe integration case study.</p>`;
    expect(detectTechStack(noHeaders, prose)).not.toContain("Stripe");
  });

  it("does not claim a whole stack from a 'technologies we work with' page", () => {
    // The worst realistic case: an agency listing every vendor it has ever used.
    const agencyPage =
      `<h2>Technologies we work with</h2><ul>` +
      `<li>React</li><li>Vue</li><li>Svelte</li><li>Gatsby</li><li>Supabase</li>` +
      `<li>Firebase</li><li>Clerk</li><li>Stripe</li><li>Sentry</li><li>Intercom</li>` +
      `<li>PostHog</li><li>Plausible</li></ul>`;
    expect(detectTechStack(noHeaders, agencyPage)).toEqual([]);
  });
});

describe("real usage is still detected", () => {
  it("detects Next.js from its build fingerprint", () => {
    expect(detectTechStack(noHeaders, `<script id="__NEXT_DATA__" type="application/json">{}</script>`))
      .toContain("Next.js");
    expect(detectTechStack(noHeaders, `<script src="/_next/static/chunks/main.js"></script>`))
      .toContain("Next.js");
  });

  it("detects Supabase from a project host or the client library", () => {
    expect(detectTechStack(noHeaders, `<script>const u="https://abcdefgh.supabase.co"</script>`))
      .toContain("Supabase");
    expect(detectTechStack(noHeaders, `<script src="/assets/supabase-js.min.js"></script>`))
      .toContain("Supabase");
  });

  it("detects Stripe from its script host", () => {
    expect(detectTechStack(noHeaders, `<script src="https://js.stripe.com/v3/"></script>`))
      .toContain("Stripe");
  });

  it("detects Clerk, Sentry, Intercom, PostHog and GA from their hosts", () => {
    const real =
      `<script src="https://clerk.example-app.dev/npm/@clerk/clerk-js"></script>` +
      `<script src="https://browser.sentry-cdn.com/7/bundle.min.js"></script>` +
      `<script src="https://widget.intercom.io/widget/abc"></script>` +
      `<script src="https://eu.posthog.com/static/array.js"></script>` +
      `<script src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>`;
    const stack = detectTechStack(noHeaders, real);
    for (const t of ["Clerk", "Sentry", "Intercom", "PostHog", "Google Analytics"]) {
      expect(stack, `${t} should be detected from its host`).toContain(t);
    }
  });

  it("detects Vue and React from runtime fingerprints, not names", () => {
    expect(detectTechStack(noHeaders, `<div data-v-1a2b3c4d>hi</div>`)).toContain("Vue");
    expect(detectTechStack(noHeaders, `<div id="root" data-reactroot="">hi</div>`)).toContain("React");
  });

  it("still reads the server stack from response headers", () => {
    const stack = detectTechStack({ "cf-ray": "abc", server: "nginx/1.24" }, "");
    expect(stack).toContain("Cloudflare");
    expect(stack).toContain("Nginx");
  });
});

describe("no duplicates", () => {
  it("reports each technology once even with several signals", () => {
    const many = `__NEXT_DATA__ /_next/static/x.js`;
    const stack = detectTechStack({ "x-powered-by": "Next.js" }, many);
    expect(stack.filter((s) => s === "Next.js")).toHaveLength(1);
  });
});
