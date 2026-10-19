/**
 * Below `sm` each course request is a stacked card, not a 7-column row.
 *
 * The table scrolls sideways (course-requests-scroll.test.tsx), which keeps every
 * column reachable — but on a 390px phone that is a 384px sideways scroll to reach
 * Status, the one control the page exists to operate. So the table is hidden below
 * `sm` and a card list takes its place. Pinned here, against the rendered DOM:
 *
 *  1. The table frame is `hidden sm:block` and the card list is `sm:hidden`, so
 *     exactly one of the two shows at any width.
 *  2. Every visible request has a card, carrying its full name (never truncated)
 *     and a status control — the dropdown in the editable view, the chip in the
 *     client's read-only one.
 *  3. The editable card has a selection checkbox; the read-only one does not.
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

const LONG =
  "Elmpter Wald Golf ClubGolfclub Elmpter Wald and Country Estate Championship";

const requests: CourseRequestRecord[] = [
  { id: "1", courseName: "Iver Golf Vlub", status: "NEW" },
  { id: "2", courseName: LONG, status: "REJECTED" },
  { id: "3", courseName: "Dorking", status: "ADDED" },
].map((r) => ({
  ...r,
  country: "England",
  notes: null,
  sourceConversationId: null,
  sentAt: null,
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
}));

const noop = async () => {};

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

describe.each([
  ["editable", { onAdd: () => {}, onEdit: () => {} }, false],
  ["readOnly", { readOnly: true }, true],
] as const)("course-request cards below sm (%s)", (_l, props, readOnly) => {
  const doc = render(props);
  const list = doc.querySelector<HTMLElement>("[data-course-cards]");
  const cards = [...doc.querySelectorAll<HTMLElement>("[data-course-card]")];

  it("hides the card list from sm up and the table below sm", () => {
    expect(list, "no card list rendered").not.toBeNull();
    expect(list!.classList.contains("sm:hidden")).toBe(true);
    const table = doc.querySelector<HTMLElement>(".overflow-x-auto");
    expect(table).not.toBeNull();
    expect(table!.classList.contains("hidden")).toBe(true);
    expect(table!.classList.contains("sm:block")).toBe(true);
  });

  it("renders one card per visible request (the default tab: NEW + REJECTED)", () => {
    expect(cards).toHaveLength(2);
  });

  it("shows the full course name, wrapping rather than truncating", () => {
    const card = cards.find((c) => c.textContent?.includes(LONG));
    expect(card, "the long name was cut or not rendered").toBeTruthy();
    expect(card!.querySelector(".truncate")).toBeNull();
  });

  it("puts the status control in every card", () => {
    for (const card of cards) {
      const control = card.querySelector("[data-status-control]");
      expect(control, "a card without a status control").not.toBeNull();
      if (!readOnly) {
        expect(control!.querySelector("button")).not.toBeNull();
      }
    }
  });

  it(`${readOnly ? "has no" : "has a"} selection checkbox`, () => {
    for (const card of cards) {
      expect(card.querySelector('input[type="checkbox"]') !== null).toBe(
        !readOnly,
      );
    }
  });
});
