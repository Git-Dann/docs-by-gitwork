/**
 * The dealt-with toggle, as rendered.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiIntakeSection } from "../wiki-intake-section";
import type { WikiIntakeItemRecord } from "@/lib/api";

const mk = (id: string, title: string, status: string): WikiIntakeItemRecord =>
  ({
    id, title, status, type: "BUG", priority: "MEDIUM", description: null,
    requestedBy: "Luke", externalRef: null, externalUrl: null, attachmentUrls: [],
    categoryId: null, categoryLabel: null, label: null, taskId: null,
    hasImage: false, source: "wiki", device: null, osVersion: null, comments: [],
    createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
  }) as unknown as WikiIntakeItemRecord;

const OPEN = mk("o", "Cannot Delete Round", "NEW");
const CLOSED = mk("c", "Leaderboard Defaulting to NR", "CLOSED");

/** The section uses React Query hooks, so it needs a provider even to render. */
const render = (items: WikiIntakeItemRecord[]) =>
  renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(WikiIntakeSection, { slug: "wedge", items, mode: "internal" }),
    ),
  );

describe("dealt-with toggle", () => {
  it("hides a dealt-with request by default", () => {
    const html = render([OPEN, CLOSED]);
    expect(html).toContain("Cannot Delete Round");
    expect(html).not.toContain("Leaderboard Defaulting to NR");
  });

  it("offers the toggle, stating how many are hidden", () => {
    const html = render([OPEN, CLOSED]);
    expect(html).toContain("Dealt with");
    expect(html).toContain('aria-pressed="false"');
  });

  it("does not offer the toggle when nothing has been dealt with", () => {
    // A "Dealt with 0" chip would be permanent noise.
    expect(render([OPEN])).not.toContain("Dealt with");
  });

  it("counts the tabs against what is actually listed", () => {
    // The ALL tab must not read 2 above a single row.
    const html = render([OPEN, CLOSED]);
    const all = html.match(/All <span[^>]*>(\d+)<\/span>/);
    expect(all?.[1]).toBe("1");
  });

  it("says 'nothing outstanding' rather than 'no requests yet' when all are dealt with", () => {
    const html = render([CLOSED]);
    expect(html).toContain("Nothing outstanding");
    expect(html).not.toContain("No bugs, feedback, or requests yet");
  });

  it("keeps the toggle on the tag line rather than wrapping below it", () => {
    /**
     * The first cut put the toggle inside the wrapping tag row with `ml-auto`, so
     * in the narrow list column it dropped onto a second line — which is not
     * "to the very right of the category tags". Screenshotting it is what caught
     * that; this pins the structure that fixed it: the tags wrap inside their own
     * group and the toggle is a non-shrinking sibling, pushed right by the row.
     */
    const html = render([OPEN, CLOSED]);
    expect(html).toContain("items-start justify-between");
    expect(html).toMatch(/Dealt with[\s\S]{0,400}?/);
    // The toggle must not rely on ml-auto inside a wrapping row.
    const toggleChunk = html.slice(html.indexOf("aria-pressed"));
    expect(toggleChunk).toContain("shrink-0");
    expect(toggleChunk.slice(0, 400)).not.toContain("ml-auto");
  });
});
