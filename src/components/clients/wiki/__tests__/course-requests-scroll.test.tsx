/**
 * The course-request table must be horizontally scrollable, and the header must
 * scroll WITH the rows.
 *
 * ── What was wrong (September 2026) ───────────────────────────────────────────
 * The row is a 7-column grid whose fixed columns total 416px, plus 72px of gaps
 * and 24px of padding, before the course name is allocated a single pixel. The
 * section renders inside `.widget-card`, which is `overflow: hidden` — so below
 * about 590px the extra columns were not merely off-screen, they were CLIPPED
 * with no scrollable ancestor to reach them. Measured in headless Chromium at
 * 390px wide: 249px lost, taking the entire Status column and its dropdown with
 * it. A phone user could not see or change a request's status at all.
 *
 * `overflow: hidden` is not a scroller — that is the whole trap
 * (docs/mobile-playbook.md §3a), and it is why neither `audit:ui` nor a page-X
 * check caught this: the page did not scroll sideways, the content was simply
 * gone.
 *
 * Three properties are pinned here, each of which is what a future edit would
 * break. They are asserted against the rendered DOM rather than the source, so
 * they hold however the classes are refactored:
 *
 *  1. There IS a horizontal scroller around the table.
 *  2. The column header lives INSIDE that same scroller — if it is left outside,
 *     the columns silently desync the moment anyone scrolls sideways.
 *  3. The inner frame carries a min-width, so the columns keep their sizes
 *     instead of crushing the course name to nothing (the tighter 512px the grid
 *     strictly needs left the name at 76px, narrower than Country beside it).
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CourseRequestsSection,
  type CourseRequestsSectionProps,
} from "../course-requests-section";
import type { CourseRequestRecord } from "@/lib/api";

const requests = [
  { id: "1", courseName: "Iver Golf Vlub", country: "England", status: "NEW" },
  {
    id: "2",
    courseName: "Dorking",
    country: "United Kingdom",
    status: "ADDED",
  },
  {
    id: "3",
    courseName: "Royal Ashdown Forest",
    country: "England",
    status: "SENT",
  },
].map((r) => ({
  ...r,
  notes: null,
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
  requestedBy: null,
  sentAt: null,
  addedAt: null,
  externalRef: null,
  holes: 18,
})) as unknown as CourseRequestRecord[];

const noop = async () => {};

/** Parse the markup so the assertions read the DOM, not the class strings. */
function render(props: Partial<CourseRequestsSectionProps>): Document {
  const html = renderToStaticMarkup(
    <CourseRequestsSection
      requests={requests}
      onDelete={noop}
      onSetStatus={noop}
      {...props}
    />,
  );
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}

/**
 * The nearest ancestor that scrolls horizontally. Read from the class list rather
 * than `getComputedStyle`, because jsdom has no Tailwind stylesheet loaded.
 */
function nearestScroller(el: Element): Element | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    if ([...n.classList].some((c) => /^overflow(-x)?-(auto|scroll)$/.test(c)))
      return n;
  }
  return null;
}

// readOnly=false is the widest variant (it adds the checkbox and actions columns),
// so it is the worst case; readOnly is the public client-facing wiki view.
describe.each([
  ["editable", { onAdd: () => {}, onEdit: () => {} }],
  ["readOnly", { readOnly: true }],
])("course-request table (%s)", (_label, props) => {
  const doc = render(props);
  const scroller = doc.querySelector(".overflow-x-auto");
  const grids = [
    ...doc.querySelectorAll<HTMLElement>("[style*='grid-template-columns']"),
  ];

  it("renders a horizontal scroller around the table", () => {
    expect(
      scroller,
      "Without a scrollable ancestor the overflowing columns are unreachable, " +
        "because .widget-card is overflow:hidden. See docs/mobile-playbook.md §3a.",
    ).not.toBeNull();
  });

  it("gives the header and the rows the SAME nearest scroller", () => {
    // `scroller.contains(header)` is not enough — a header nested in its own
    // scroller inside the outer one satisfies that and still desyncs. The
    // property that matters is that they share their NEAREST scroller, so the
    // two move as one.
    expect(grids.length).toBeGreaterThan(1);
    const owners = grids.map(nearestScroller);
    expect(
      owners.every((o) => o !== null),
      "Every grid row must sit inside a horizontal scroller.",
    ).toBe(true);
    expect(
      new Set(owners).size,
      "The header and the rows must share ONE scroller or the columns desync as " +
        "soon as the table is scrolled sideways.",
    ).toBe(1);
  });

  it("gives the scroller's inner frame a min-width", () => {
    const inner = scroller!.firstElementChild as HTMLElement | null;
    expect(inner).not.toBeNull();
    const min = [...inner!.classList].find((c) => c.startsWith("min-w-["));
    expect(
      min,
      "Without a min-width the grid crushes its 1fr course-name column instead of " +
        "scrolling — measured at 76px, narrower than the Country column beside it.",
    ).toBeTruthy();
    // Enough for the fixed columns (416px) + gaps (72px) + padding (24px) and a
    // readable name, not merely enough to avoid an ellipsis.
    const px = Number(min!.replace(/\D/g, ""));
    expect(px).toBeGreaterThanOrEqual(640);
  });

  it("keeps every column in one grid definition", () => {
    // Two different templates for header and rows is how columns drift apart;
    // both must come from the same `gridCols` value.
    const templates = new Set(grids.map((g) => g.style.gridTemplateColumns));
    expect(templates.size).toBe(1);
  });
});
