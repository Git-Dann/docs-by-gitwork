/**
 * The Requests tracker grid — the stage column, the scroll contract, and the export.
 *
 * ── What this section is for ──────────────────────────────────────────────────
 * A request promoted to a task used to read "Task created" forever: nothing wrote
 * back to `ClientWikiIntakeItem` when a developer moved the card. The Stage column
 * closes that by DERIVING each request's position from the linked task's board
 * column on every read (src/lib/wiki-request-stage.ts). These tests pin the two
 * halves that can regress independently — that the column exists and says the
 * right thing, and that the grid it lives in is actually reachable.
 *
 * ── The scroll contract (CLAUDE.md §45.2) ─────────────────────────────────────
 * This section renders inside `.widget-card`, which is `overflow: hidden`. A grid
 * wider than the card with no scroller of its own is not off-screen, it is
 * UNREACHABLE — and neither `audit:ui` nor a page-overflow check can see it,
 * because the page never scrolls sideways. The course-request table shipped that
 * way and lost 249px at 390px wide, taking its whole Status column with it.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiIntakeSection, requestsAsTsv } from "../wiki-intake-section";
import { DEFAULT_INTAKE_CATEGORIES } from "@/lib/wiki-intake-categories";
import type { WikiIntakeItemRecord } from "@/lib/api";

function mk(over: Partial<WikiIntakeItemRecord> = {}): WikiIntakeItemRecord {
  return {
    id: "r1",
    type: "BUG",
    title: "Leaderboard shows last week's scores",
    description: "Only on the iPad build.",
    priority: "HIGH",
    status: "NEW",
    requestedBy: "Luke Harding",
    externalRef: null,
    label: null,
    categoryId: null,
    categoryLabel: null,
    externalUrl: null,
    attachmentUrls: [],
    source: "wiki",
    taskId: null,
    taskStatus: null,
    stage: "NEW",
    hasImage: false,
    imageFilename: null,
    device: null,
    osVersion: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    comments: [],
    ...over,
  };
}

function render(items: WikiIntakeItemRecord[], mode: "internal" | "public"): Document {
  const html = renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(WikiIntakeSection, {
        slug: "wedge",
        token: "tok",
        items,
        mode,
        categories: DEFAULT_INTAKE_CATEGORIES,
      }),
    ),
  );
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}

/** The nearest ancestor that scrolls horizontally. Read from the class list rather
 *  than `getComputedStyle`, because jsdom has no Tailwind stylesheet loaded. */
function nearestScroller(el: Element): Element | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    if ([...n.classList].some((c) => /^overflow(-x)?-(auto|scroll)$/.test(c))) return n;
  }
  return null;
}

const gridsIn = (doc: Document) =>
  [...doc.querySelectorAll<HTMLElement>("div")].filter((el) =>
    [...el.classList].some((c) => c.startsWith("grid-cols-[")),
  );

// The internal view is the widest variant (it adds the checkbox and actions
// columns), so it is the worst case; public is the client-facing wiki view.
describe.each([
  ["internal", "internal" as const],
  ["public", "public" as const],
])("requests tracker (%s)", (_label, mode) => {
  const doc = render([mk(), mk({ id: "r2", title: "Second" })], mode);

  it("renders a horizontal scroller around the grid", () => {
    expect(
      doc.querySelector(".overflow-x-auto"),
      "Without a scrollable ancestor the overflowing columns are unreachable, " +
        "because .widget-card is overflow:hidden. See docs/mobile-playbook.md §3a.",
    ).not.toBeNull();
  });

  it("gives the column header and the rows the SAME nearest scroller", () => {
    // `scroller.contains(header)` is not enough — a header nested in its own
    // scroller inside the outer one satisfies that and still desyncs. What matters
    // is that they share their NEAREST scroller, so the two move as one.
    const grids = gridsIn(doc);
    expect(grids.length).toBeGreaterThan(1);
    const owners = grids.map(nearestScroller);
    expect(owners.every((o) => o !== null)).toBe(true);
    expect(
      new Set(owners).size,
      "The header and the rows must share ONE scroller or the columns desync as " +
        "soon as the grid is scrolled sideways.",
    ).toBe(1);
  });

  it("keeps every column in one grid definition", () => {
    // Two different templates for header and rows is how columns drift apart.
    const templates = new Set(
      gridsIn(doc).map((g) => [...g.classList].filter((c) => c.includes("grid-cols-[")).join(" ")),
    );
    expect(templates.size).toBe(1);
  });

  it("applies the min-width only from `md` up, so a phone never scrolls sideways", () => {
    // The mobile answer here is NOT a scroller — it is fewer columns. Below `md`
    // the grid is two columns (request + stage) and nothing overflows, so an
    // unprefixed min-width would manufacture a sideways scroll that need not exist.
    const inner = doc.querySelector(".overflow-x-auto")!.firstElementChild as HTMLElement;
    const min = [...inner.classList].find((c) => c.includes("min-w-["));
    expect(min, "The md+ grid must keep its column sizes rather than crushing the title.").toBeTruthy();
    expect(min!.startsWith("md:"), `min-width "${min}" must be md-prefixed`).toBe(true);
    // Enough for the fixed columns (~590px) + gaps + padding AND a readable title,
    // not merely enough to avoid an ellipsis.
    expect(Number(min!.replace(/\D/g, ""))).toBeGreaterThanOrEqual(900);
  });

  it("carries the hidden columns' values on a sub-line below `md`", () => {
    // Category / Priority / From / Updated have no column on a phone. If they were
    // simply dropped the mobile view would be strictly less informative than the
    // card layout it replaced, which would be a regression dressed as a redesign.
    const sub = doc.querySelector(".md\\:hidden");
    expect(sub?.textContent).toContain("Bug");
    expect(sub?.textContent).toContain("HIGH");
    expect(sub?.textContent).toContain("Luke Harding");
  });
});

describe("the Stage column reports the board, not the intake row", () => {
  it("says In progress for a request whose task is being worked on", () => {
    // This is the defect the feature exists for. Before it, this row read
    // "Task created" — and would have kept reading it after the fix shipped.
    const doc = render(
      [mk({ status: "PROMOTED", taskId: "t1", taskStatus: "DOING", stage: "IN_PROGRESS" })],
      "internal",
    );
    expect(doc.body.textContent).toContain("In progress");
  });

  it("shows the client the same stage the team sees", () => {
    // One component, one derivation, both audiences — so the two can never be told
    // different things about the same request (the §42.4 rule).
    const item = mk({ status: "PROMOTED", taskId: "t1", taskStatus: "DONE", stage: "DONE" });
    expect(render([item], "public").body.textContent).toContain("Done");
    expect(render([item], "internal").body.textContent).toContain("Done");
  });

  it("renders an em-dash rather than an empty chip for an unknown stage", () => {
    // Reachable exactly once: a React Query cache written by the deploy before
    // `stage` existed. Without the guard the chip rendered no text and a literal
    // `undefined` in its class list, which reads as a broken column.
    const stale = { ...mk(), stage: undefined } as unknown as WikiIntakeItemRecord;
    const doc = render([stale], "internal");
    expect(doc.body.innerHTML).not.toContain("undefined");
  });

  it("offers a stage filter only once more than one stage is present", () => {
    // A dropdown with one option is chrome that answers nothing.
    const one = render([mk(), mk({ id: "r2" })], "internal");
    expect(one.querySelector('select[aria-label="Filter by stage"]')).toBeNull();

    const two = render(
      [mk(), mk({ id: "r2", status: "PROMOTED", taskId: "t", taskStatus: "DOING", stage: "IN_PROGRESS" })],
      "internal",
    );
    expect(two.querySelector('select[aria-label="Filter by stage"]')).not.toBeNull();
  });
});

describe("bulk actions are internal-only", () => {
  it("gives the team a checkbox per row and the client none", () => {
    // A client selecting rows could only lead to actions they are not allowed to
    // take — the server refuses them, so offering the control is a dead end.
    const team = render([mk()], "internal");
    const client = render([mk()], "public");
    expect(team.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
    expect(client.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });
});

describe("requestsAsTsv", () => {
  const cats = DEFAULT_INTAKE_CATEGORIES;

  it("leads with a header row and one tab-separated line per request", () => {
    const tsv = requestsAsTsv([mk({ stage: "IN_PROGRESS" })], cats);
    const [head, row] = tsv.split("\n");
    expect(head.split("\t")).toEqual([
      "Request",
      "Category",
      "Priority",
      "Stage",
      "Requested by",
      "Logged",
      "Updated",
    ]);
    expect(row.split("\t")).toHaveLength(7);
    expect(row.split("\t")[3]).toBe("In progress");
  });

  it("neutralises tabs and newlines inside a title", () => {
    // A pasted title containing either would split one request across several
    // columns or several rows — silently, and only for the one that contained it.
    const tsv = requestsAsTsv([mk({ title: "Fix\tthe\nleaderboard" })], cats);
    expect(tsv.split("\n")).toHaveLength(2);
    expect(tsv.split("\n")[1].split("\t")[0]).toBe("Fix the leaderboard");
  });

  it("exports the stage a client would read, not the raw intake status", () => {
    // The whole point of the export is that the spreadsheet says the same thing the
    // page does. "PROMOTED" pasted into a client's sheet means nothing to them.
    const tsv = requestsAsTsv(
      [mk({ status: "PROMOTED", taskId: "t", taskStatus: "BACKLOG", stage: "SCHEDULED" })],
      cats,
    );
    expect(tsv).toContain("Scheduled");
    expect(tsv).not.toContain("PROMOTED");
  });
});

describe("nothing truncates without a way to read it", () => {
  it("gives every truncated cell a title", () => {
    // `truncate` with no `title` and no scroller is a TRUNCATED defect under
    // audit:clipping. Measured at 375px: the mobile sub-line really does cut off
    // mid-name, so this is the difference between a readable row and a lost one.
    const doc = render(
      [
        mk({
          title: "A request with a title long enough that it will certainly not fit the column",
          requestedBy: "Priya Shah",
        }),
      ],
      "internal",
    );
    const truncated = [...doc.querySelectorAll("*")].filter((el) =>
      el.classList.contains("truncate"),
    );
    expect(truncated.length).toBeGreaterThan(0);
    for (const el of truncated) {
      const withTitle = el.hasAttribute("title") || el.closest("[title]") !== null;
      expect(withTitle, `<${el.tagName.toLowerCase()}> "${el.textContent?.slice(0, 40)}" truncates with no title`).toBe(true);
    }
  });
});
