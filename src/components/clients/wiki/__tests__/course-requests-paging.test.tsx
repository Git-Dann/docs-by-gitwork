/**
 * Wedge has 1,000+ new course requests. Drawing every one (twice: the table and the phone
 * cards are both in the page) froze the tab, so the list draws a page at a time. Rendered
 * here, against the real component.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseRequestsSection, PAGE_SIZE } from "../course-requests-section";
import type { CourseRequestRecord } from "@/lib/api";
import { countCourseRequests } from "@/lib/course-request-counts";

const make = (n: number, status: CourseRequestRecord["status"] = "NEW"): CourseRequestRecord[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    courseName: `Course ${i}`,
    country: "England",
    status,
    notes: null,
    sourceConversationId: null,
    sentAt: null,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
  }));

const noop = async () => {};
const render = (requests: CourseRequestRecord[]) =>
  new DOMParser().parseFromString(
    `<body>${renderToStaticMarkup(<CourseRequestsSection requests={requests} onDelete={noop} onSetStatus={noop} />)}</body>`,
    "text/html",
  );

describe("course requests draw a page at a time", () => {
  it("draws the first page and says how many more there are", () => {
    const doc = render(make(250));
    // One checkbox per drawn row, in the table and the phone list.
    expect(doc.querySelectorAll('input[type="checkbox"][aria-label^="Select Course"]').length).toBe(PAGE_SIZE * 2);
    expect(doc.body.textContent).toContain(`Show ${PAGE_SIZE} more · 150 not shown`);
  });

  it("draws everything, with no Show more, when it fits on one page", () => {
    const doc = render(make(40));
    expect(doc.querySelectorAll('input[type="checkbox"][aria-label^="Select Course"]').length).toBe(80);
    expect(doc.body.textContent).not.toContain("not shown");
  });

  it("labels every row's checkbox, so a screen reader can tell them apart", () => {
    const doc = render(make(3));
    const boxes = [...doc.querySelectorAll('input[type="checkbox"]')];
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(b.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("countCourseRequests (the dashboard card's figures)", () => {
  it("counts each status and the total", () => {
    expect(countCourseRequests([...make(3), ...make(2, "SENT"), ...make(1, "ADDED")])).toEqual({
      NEW: 3,
      SENT: 2,
      ADDED: 1,
      REJECTED: 0,
      total: 6,
    });
  });
});
