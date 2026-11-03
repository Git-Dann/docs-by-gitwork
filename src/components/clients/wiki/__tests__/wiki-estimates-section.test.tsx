/**
 * The Estimates section as a client sees it.
 *
 * The arithmetic is pinned in src/lib/__tests__/wiki-estimates.test.ts; this pins what the
 * page says about it — that each team gets a calendar row, that the extra-people-buy-
 * nothing case is said in words, that an unagreed start is never presented as agreed, and
 * that nothing on the page can force a sideways scroll.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiEstimatesSection } from "../wiki-estimates-section";
import type { Estimate } from "@/types/wiki-estimates";

function estimate(over: Partial<Estimate> = {}): Estimate {
  return {
    id: "e1",
    title: "Version 1 — member app",
    summary: "Accounts, booking and payments.",
    startDate: "2026-11-02",
    teamSizes: [1, 2, 3, 4],
    recommendedTeam: 2,
    coordination: "TYPICAL",
    contingencyPct: 20,
    phases: [
      { id: "p1", name: "Discovery", effortDays: 5, maxDevs: 1 },
      { id: "p2", name: "Build", effortDays: 60, maxDevs: null },
    ],
    orderKey: 0,
    updatedAt: "2026-10-12T09:00:00.000Z",
    ...over,
  };
}

function render(estimates: Estimate[], mode: "internal" | "public" = "public"): Document {
  const html = renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(WikiEstimatesSection, {
        slug: "northwind",
        section: { enabled: true, estimates },
        mode,
      }),
    ),
  );
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}

describe("WikiEstimatesSection", () => {
  it("is two panels: the answer, then the calendar", () => {
    const doc = render([estimate()]);
    const headers = [...doc.querySelectorAll(".widget-header__label")].map((h) => h.textContent);
    expect(headers).toEqual(["01 // ESTIMATE", "02 // CALENDAR"]);
  });

  it("opens on the recommended team and gives every team size a calendar row", () => {
    const doc = render([estimate()]);
    expect(doc.body.textContent).toContain("With 2 developers");
    const rows = doc.querySelectorAll('button[aria-label*="developer"][aria-label*="done by"]');
    expect(rows).toHaveLength(4);
    expect(doc.querySelector('button[aria-pressed="true"][aria-label^="2 developers"]')).not.toBeNull();
  });

  it("says in words when a bigger team buys nothing", () => {
    const capped = estimate({
      teamSizes: [2, 3],
      recommendedTeam: 3,
      phases: [{ id: "p", name: "Build", effortDays: 20, maxDevs: 2 }],
    });
    expect(render([capped]).body.textContent).toContain("No faster than 2 developers");
  });

  it("never presents an unagreed start date as agreed", () => {
    const text = render([estimate({ startDate: null })]).body.textContent ?? "";
    expect(text).toMatch(/no start date agreed/i);
    expect(text).not.toMatch(/^Starting/im);
  });

  it("an estimate with no effort shows no figure at all — never '0 weeks'", () => {
    const empty = estimate({ phases: [] });
    const text = render([empty], "internal").body.textContent ?? "";
    expect(text).toContain("no phases with effort yet");
    expect(text).not.toMatch(/\b0 weeks\b/);
    expect(text).not.toContain("02 // CALENDAR");
  });

  it("offers a picker only when there is more than one estimate", () => {
    expect(render([estimate()]).querySelector('select[aria-label="Estimate"]')).toBeNull();
    expect(
      render([estimate(), estimate({ id: "e2", title: "Loyalty add-on" })]).querySelector(
        'select[aria-label="Estimate"]',
      ),
    ).not.toBeNull();
  });

  it("nothing on the page sets a fixed width a phone could not hold", () => {
    // The calendar zooms and pages rather than widening, so no min-w/w-[Npx] over a
    // phone's content width is allowed anywhere in the section (CLAUDE.md §45.2).
    const html = render([estimate()]).body.innerHTML;
    const widths = [...html.matchAll(/(?:min-)?w-\[(\d+)px\]/g)].map((m) => Number(m[1]));
    expect(widths.filter((w) => w > 320)).toEqual([]);
  });

  it("the public view has no edit controls", () => {
    const doc = render([estimate()], "public");
    const labels = [...doc.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Edit");
    expect(labels).not.toContain("New");
  });
});
