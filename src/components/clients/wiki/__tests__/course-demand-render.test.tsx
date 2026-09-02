/**
 * The Demand column, as rendered.
 *
 * The invariant worth pinning is that demand is computed over EVERY request, not
 * over the filtered view the tab is showing. It is an easy and invisible thing to
 * break — `filtered` is right there in scope, the component compiles either way,
 * and the numbers still look plausible. But a course three golfers asked for that
 * was sent to the provider months ago would then read "1 LOW" in the New tab,
 * which is the exact wrong answer: it is the most wanted course on the list.
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

const noop = async () => {};

/** Verbatim live names: three spellings of one course, plus a control. */
function makeRequests(): CourseRequestRecord[] {
  return [
    { id: "a1", courseName: "Allen Park Golf Centre", status: "NEW" },
    { id: "a2", courseName: "AllenPark", status: "SENT" },
    { id: "a3", courseName: "Allen park", status: "ADDED" },
    { id: "d1", courseName: "Dorking", status: "NEW" },
  ].map((r) => ({
    ...r,
    country: "United Kingdom",
    notes: null,
    sourceConversationId: null,
    sentAt: null,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
  })) as unknown as CourseRequestRecord[];
}

function render(props: Partial<CourseRequestsSectionProps> = {}): Document {
  const html = renderToStaticMarkup(
    <CourseRequestsSection
      requests={makeRequests()}
      onDelete={noop}
      onSetStatus={noop}
      {...props}
    />,
  );
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}

/** The rendered rows, each as { name, count, level }. */
function rows(doc: Document) {
  return [
    ...doc.querySelectorAll<HTMLElement>(
      '.divide-y > div[style*="grid-template-columns"]',
    ),
  ]
    .map((row) => {
      const cells = [...row.children] as HTMLElement[];
      const name = cells
        .find((c) => c.classList.contains("min-w-0"))
        ?.textContent?.trim();
      const demandCell = cells.find((c) => c.getAttribute("title"));
      const spans = demandCell ? [...demandCell.querySelectorAll("span")] : [];
      return {
        name,
        count: spans[0]?.textContent?.trim(),
        level: spans[1]?.textContent?.trim(),
        title: demandCell?.getAttribute("title") ?? "",
      };
    })
    .filter((r) => r.name);
}

describe("demand column", () => {
  it("renders a count and a level for every row", () => {
    const list = rows(render());
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) {
      expect(r.count, `${r.name} has no count`).toMatch(/^\d+$/);
      expect(r.level, `${r.name} has no level`).toMatch(/^(LOW|MEDIUM|HIGH)$/);
    }
  });

  it("counts across every status, not just the visible tab", () => {
    // The default tab shows only NEW/REJECTED, so two of the three Allen Park
    // rows (SENT and ADDED) are NOT on screen. The visible one must still read 3.
    const list = rows(render());
    const allen = list.find((r) => r.name?.startsWith("Allen"));
    expect(allen).toBeTruthy();
    expect(
      allen!.count,
      "Demand must be computed from the complete request list. Reading 1 here " +
        "means it was computed from the filtered view, which hides the fact that " +
        "this is the most-requested course on the board.",
    ).toBe("3");
    expect(allen!.level).toBe("HIGH");
  });

  it("leaves a singly-requested course at 1 LOW", () => {
    const dorking = rows(render()).find((r) => r.name === "Dorking");
    expect(dorking).toMatchObject({ count: "1", level: "LOW" });
  });

  it("names the folded spellings in the title, so the grouping is checkable", () => {
    // The count is a judgement about free-text names; a reader must be able to
    // see which rows were treated as the same course.
    const allen = rows(render()).find((r) => r.name?.startsWith("Allen"));
    expect(allen!.title).toContain("Allen Park Golf Centre");
    expect(allen!.title).toContain("AllenPark");
    expect(allen!.title).toContain("Allen park");
  });

  it("renders the column in the read-only client view too", () => {
    const doc = render({ readOnly: true });
    const header = [...doc.querySelectorAll("span")].map((s) =>
      s.textContent?.trim(),
    );
    expect(header).toContain("Demand");
  });

  it("keeps the header and the row cells in one grid definition", () => {
    // A Demand header without a Demand cell (or vice versa) silently shifts every
    // column after it — the values would sit under the wrong headings.
    const doc = render();
    const templates = new Set(
      [
        ...doc.querySelectorAll<HTMLElement>(
          "[style*='grid-template-columns']",
        ),
      ].map((g) => g.style.gridTemplateColumns),
    );
    expect(templates.size).toBe(1);
    // 8 tracks: checkbox | course | demand | country | submitted | sent | status | actions
    expect([...templates][0].trim().split(/\s+/)).toHaveLength(8);
  });
});
