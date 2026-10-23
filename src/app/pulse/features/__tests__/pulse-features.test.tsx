import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AREAS, EXTRAS, PULSE_INPUTS, PULSE_PLATFORMS, PULSE_SUMMARY } from "@/lib/pulse-capabilities";
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

  it("describes Pulse as it is — no 'new', 'recently' or dates", () => {
    const copy = [
      PULSE_SUMMARY,
      ...PULSE_INPUTS.flatMap((i) => [i.name, i.detail]),
      ...Object.values(AREAS).flatMap((a) => [a.name, a.covers]),
      ...EXTRAS.flatMap((e) => [e.name, e.detail]),
    ].join(" \n ");
    expect(copy).not.toMatch(/\b(new|newly|recently|latest|just (added|shipped)|coming soon)\b/i);
    expect(copy).not.toMatch(/\b20\d\d\b/);
  });

  it("lists the scan form's product types, without 'Other'", () => {
    expect(PULSE_PLATFORMS).toContain("iOS app");
    expect(PULSE_PLATFORMS).not.toContain("Other");
  });

  it("the page renders the live total and every area", () => {
    const html = renderToStaticMarkup(<PulseFeaturesPage />);
    const { checks, areas } = pulseCapabilityCounts();
    expect(html).toContain(`${checks.toLocaleString("en-GB")} checks, by area`);
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
