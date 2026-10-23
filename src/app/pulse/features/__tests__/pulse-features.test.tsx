import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AREAS, AREA_GROUPS, EXTRAS, PULSE_INPUTS, PULSE_PLATFORMS, PULSE_STEPS, PULSE_SUMMARY } from "@/lib/pulse-capabilities";
import { matchesQuery, searchArea } from "@/app/pulse/features/check-explorer";
import { pulseCapabilityCounts } from "@/server/pulse-capabilities";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import PulseFeaturesPage from "@/app/pulse/features/page";

// The page is shared with people outside Gitwork, so it must stay TRUE as Pulse changes.

describe("what the features page says stays true", () => {
  it("⚠️ every feature listed is backed by code that still exists", () => {
    for (const e of EXTRAS) expect(existsSync(e.evidence), `${e.name} → ${e.evidence}`).toBe(true);
  });

  it("the total is the registry's, and the areas add up to it", () => {
    const { checks, areas } = pulseCapabilityCounts();
    expect(checks).toBe(CHECKS_REGISTRY.length);
    expect(areas.reduce((n, a) => n + a.checks, 0)).toBe(checks);
  });

  it("⚠️ every area that has checks is described — none silently missing from the table", () => {
    const withChecks = new Set(CHECKS_REGISTRY.map((c) => c.category));
    const shown = new Set(pulseCapabilityCounts().areas.map((a) => a.category));
    expect([...withChecks].filter((c) => !shown.has(c))).toEqual([]);
    for (const a of Object.values(AREAS)) expect(a.covers.trim().length).toBeGreaterThan(10);
  });

  const copy = () =>
    [
      PULSE_SUMMARY,
      ...PULSE_INPUTS.flatMap((i) => [i.name, i.detail]),
      ...PULSE_STEPS.flatMap((i) => [i.title, i.detail]),
      ...AREA_GROUPS.flatMap((g) => [g.name, g.line]),
      ...Object.values(AREAS).flatMap((a) => [a.name, a.covers]),
      ...EXTRAS.flatMap((e) => [e.name, e.detail]),
    ].join(" \n ");

  it("describes Pulse as it is — no 'new', 'recently' or dates", () => {
    expect(copy()).not.toMatch(/\b(new|newly|recently|latest|just (added|shipped)|coming soon)\b/i);
    expect(copy()).not.toMatch(/\b20\d\d\b/);
  });

  it("follows the Gitwork copy rules: no em dashes, never 'free'", () => {
    expect(copy()).not.toContain("—");
    expect(copy()).not.toMatch(/\bfree\b/i);
    const html = renderToStaticMarkup(<PulseFeaturesPage />);
    const visible = html.replace(/<[^>]+>/g, " ");
    expect(visible).not.toContain("—");
    expect(visible).not.toMatch(/\bfree\b/i);
  });

  it("every area belongs to a section that exists, and every section has an area", () => {
    const ids = new Set<string>(AREA_GROUPS.map((g) => g.id));
    for (const a of Object.values(AREAS)) expect(ids.has(a.group)).toBe(true);
    for (const g of AREA_GROUPS) expect(Object.values(AREAS).some((a) => a.group === g.id)).toBe(true);
  });

  it("the search matches every word, in any order, ignoring case", () => {
    expect(matchesQuery("Stripe webhook signature is verified", "webhook STRIPE")).toBe(true);
    expect(matchesQuery("Stripe webhook signature is verified", "stripe refund")).toBe(false);
  });

  it("a search shows the checks that match, not every check in an area whose description matches", () => {
    const payments = { name: "Payments", covers: "Stripe setup, card security", labels: ["Stripe webhook verified", "Card numbers never reach the server"] };
    expect(searchArea(payments, "stripe")).toEqual(["Stripe webhook verified"]);
    expect(searchArea(payments, "payments")).toEqual(payments.labels);
    expect(searchArea(payments, "kubernetes")).toEqual([]);
  });

  it("is not a sales page: no call to book or buy", () => {
    const html = renderToStaticMarkup(<PulseFeaturesPage />);
    expect(html).not.toMatch(/book|run a (free )?check|\/production-ready/i);
  });

  it("lists the scan form's product types, without 'Other'", () => {
    expect(PULSE_PLATFORMS).toContain("iOS app");
    expect(PULSE_PLATFORMS).not.toContain("Other");
  });

  it("the page renders the live total and every area", () => {
    const html = renderToStaticMarkup(<PulseFeaturesPage />).replace(/<!-- -->/g, "");
    const { checks, areas } = pulseCapabilityCounts();
    expect(html).toContain(`${checks.toLocaleString("en-GB")} checks, in`);
    for (const a of areas) expect(html).toContain(a.name.replace(/&/g, "&amp;"));
  });
});

describe("the About Pulse card", () => {
  it("shows the live counts and the shareable link", async () => {
    const { PulseAboutPanel, PULSE_FEATURES_URL } = await import("@/components/pulse/pulse-about-panel");
    const { checks, areas } = pulseCapabilityCounts();
    const html = renderToStaticMarkup(<PulseAboutPanel checks={checks} areas={areas.length} collapsed={false} />);
    expect(html).toContain(PULSE_FEATURES_URL);
    expect(PULSE_FEATURES_URL.endsWith("/pulse/features")).toBe(true);
    expect(html).toContain(checks.toLocaleString("en-GB"));
  });
});
