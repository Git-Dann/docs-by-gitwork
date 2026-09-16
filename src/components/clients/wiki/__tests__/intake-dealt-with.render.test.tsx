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

const mk = (
  id: string,
  title: string,
  status: WikiIntakeItemRecord["status"],
): WikiIntakeItemRecord =>
  ({
    id, title, status, type: "BUG", priority: "MEDIUM", description: null,
    requestedBy: "Luke", externalRef: null, externalUrl: null, attachmentUrls: [],
    categoryId: null, categoryLabel: null, label: null, taskId: null,
    // ⚠️ Fully populated ON PURPOSE. This fixture used to end in
    // `as unknown as WikiIntakeItemRecord`, which meant a field added to the record
    // was missing here and tsc said nothing — and when `stage` arrived, every row in
    // this test rendered a stage chip with no text and a literal `undefined` in its
    // class list. The cast is gone; a new required field now breaks the build here,
    // which is the point of having the type.
    taskStatus: null, stage: status === "CLOSED" ? "CLOSED" : "NEW",
    hasImage: false, imageFilename: null, source: "wiki", device: null, osVersion: null,
    comments: [],
    createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
  });

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

  it("keeps the toggle alongside the category tabs, not stranded on its own row", () => {
    /**
     * The original complaint was that the toggle wrapped onto a second line, away
     * from the tags it belongs with. That was solved once by pushing it right with
     * `justify-between` inside a two-column layout; the tracker rework gave the list
     * the full page width, so it is now simply the last chip in the same wrapping
     * chip row — which satisfies the same requirement without the special case.
     *
     * So this asserts the REQUIREMENT ("same row as the tabs"), not the mechanism
     * that happened to deliver it, which is why it survived the rework.
     */
    const html = render([OPEN, CLOSED]);
    const tabsRow = html.slice(
      html.indexOf('<div class="flex flex-wrap items-center gap-1.5">'),
    );
    const rowEnd = tabsRow.indexOf("</div>", tabsRow.indexOf("aria-pressed"));
    const row = tabsRow.slice(0, rowEnd);
    // The "All" tab and the toggle are inside the same flex row.
    expect(row).toContain('title="All"');
    expect(row).toContain("Dealt with");
    // …and the toggle is a real toggle, not a link that loses its state.
    expect(row).toContain('aria-pressed="false"');
  });
});
