// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WikiIntakeItemRecord } from "@/lib/api";
import { DEFAULT_INTAKE_CATEGORIES, type IntakeCategory } from "@/lib/wiki-intake-categories";
import { WikiIntakeSection } from "@/components/clients/wiki/wiki-intake-section";

/**
 * Category tabs + 10-per-page pagination on the Requests intake list.
 *
 * A client wanted to log design edits/changes without them mixing into a dev's
 * Bug/Request view — this drives the real component with a mixed set of items
 * (including the new DESIGN type) and clicks through tabs and Next/Previous,
 * rather than only asserting on the filtering/paging math in isolation.
 */

let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  document.body.innerHTML = "";
});

function makeItem(id: string, type: WikiIntakeItemRecord["type"]): WikiIntakeItemRecord {
  return {
    id,
    type,
    title: `${type} item ${id}`,
    description: null,
    priority: "MEDIUM",
    status: "NEW",
    requestedBy: null,
    externalRef: null,
    label: null,
    categoryId: null,
    categoryLabel: null,
    externalUrl: null,
    attachmentUrls: [],
    source: "wiki",
    taskId: null,
    hasImage: false,
    imageFilename: null,
    device: null,
    osVersion: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [],
  };
}

// 12 BUG + 5 FEEDBACK + 3 TASK + 3 DESIGN = 23 — enough to push both "ALL" and
// the "Bug" tab past one page of 10, while "Design" stays a single page.
const ITEMS: WikiIntakeItemRecord[] = [
  ...Array.from({ length: 12 }, (_, i) => makeItem(`bug-${i}`, "BUG")),
  ...Array.from({ length: 5 }, (_, i) => makeItem(`fb-${i}`, "FEEDBACK")),
  ...Array.from({ length: 3 }, (_, i) => makeItem(`task-${i}`, "TASK")),
  ...Array.from({ length: 3 }, (_, i) => makeItem(`design-${i}`, "DESIGN")),
];

function render(opts: { items?: WikiIntakeItemRecord[]; categories?: IntakeCategory[] } = {}) {
  const root = createRoot(host);
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WikiIntakeSection
          slug="acme"
          items={opts.items ?? ITEMS}
          mode="internal"
          categories={opts.categories}
        />
      </QueryClientProvider>,
    ),
  );
}

// Filter tabs are the `rounded-full` buttons carrying a trailing count. (The
// form's own category picker is a <select>, not buttons, so it can't be hit
// by accident here — but keep the class check so that stays true if it ever
// goes back to pills.)
function tabButton(label: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find(
    (b) => b.className.includes("rounded-full") && b.textContent?.trim().startsWith(label),
  );
  if (!button) throw new Error(`No filter tab starting with "${label}"`);
  return button;
}

function pagerButton(label: "Next" | "Previous"): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
  if (!button) throw new Error(`No pager button "${label}"`);
  return button;
}

function click(button: HTMLButtonElement) {
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function articleCount(): number {
  return host.querySelectorAll("article").length;
}

describe("WikiIntakeSection — category tabs + pagination", () => {
  it("renders one tab per label, starting with ALL, each carrying its own count", () => {
    render();
    expect(tabButton("All").textContent).toContain("23");
    expect(tabButton("Bug").textContent).toContain("12");
    expect(tabButton("Feedback").textContent).toContain("5");
    expect(tabButton("Request").textContent).toContain("3");
    expect(tabButton("Design").textContent).toContain("3");
  });

  it("caps the ALL tab at 10 rows per page and reports the page count", () => {
    render();
    expect(articleCount()).toBe(10);
    expect(host.textContent).toContain("PAGE 1 OF 3");
  });

  it("Next/Previous page through the remaining rows without changing the filter", () => {
    render();
    click(pagerButton("Next"));
    expect(articleCount()).toBe(10);
    expect(host.textContent).toContain("PAGE 2 OF 3");

    click(pagerButton("Next"));
    expect(articleCount()).toBe(3);
    expect(host.textContent).toContain("PAGE 3 OF 3");
    expect(pagerButton("Next").hasAttribute("disabled")).toBe(true);

    click(pagerButton("Previous"));
    expect(host.textContent).toContain("PAGE 2 OF 3");
  });

  it("filtering to Bug hides Design/Feedback/Request items and still paginates", () => {
    render();
    click(tabButton("Bug"));
    expect(articleCount()).toBe(10);
    expect(host.textContent).toContain("PAGE 1 OF 2");
    expect(host.textContent).not.toContain("DESIGN item");
    expect(host.textContent).not.toContain("FEEDBACK item");

    click(pagerButton("Next"));
    expect(articleCount()).toBe(2);
    expect(host.textContent).toContain("PAGE 2 OF 2");
  });

  it("filtering to Design shows only the 3 design items with no pagination bar", () => {
    render();
    click(tabButton("Design"));
    expect(articleCount()).toBe(3);
    expect(host.textContent).not.toContain("PAGE 1 OF");
    expect(host.textContent).not.toContain("BUG item");
  });

  it("switching tabs resets back to page 1", () => {
    render();
    click(pagerButton("Next"));
    expect(host.textContent).toContain("PAGE 2 OF 3");

    click(tabButton("Bug"));
    expect(host.textContent).toContain("PAGE 1 OF 2");
  });
});

/**
 * Per-client categories: a client uses their own wording ("Quick Design fix
 * (V1)") without that phrasing becoming a global type on every other client's
 * form. The underlying type still drives dev behaviour, so both must line up.
 */
describe("WikiIntakeSection — per-client categories", () => {
  const CUSTOM: IntakeCategory[] = [
    { id: "bug", label: "Bug", mapsTo: "BUG" },
    { id: "content-tweak", label: "Content tweak", mapsTo: "TASK" },
    { id: "quick-design-v1", label: "Quick Design fix (V1)", mapsTo: "DESIGN" },
  ];

  let seq = 0;
  function categorised(id: string, type: WikiIntakeItemRecord["type"], label: string) {
    seq += 1;
    return { ...makeItem(`c-${id}-${seq}`, type), categoryId: id, categoryLabel: label };
  }

  it("renders the client's own categories as the tabs, not the built-in four", () => {
    render({ items: [], categories: CUSTOM });
    expect(tabButton("All")).toBeTruthy();
    expect(tabButton("Content tweak")).toBeTruthy();
    expect(tabButton("Quick Design fix (V1)")).toBeTruthy();
    // "Feedback" is not one of this client's categories.
    expect(() => tabButton("Feedback")).toThrow();
  });

  it("filters by the client's category, not the underlying type", () => {
    const items = [
      categorised("content-tweak", "TASK", "Content tweak"),
      categorised("quick-design-v1", "DESIGN", "Quick Design fix (V1)"),
      categorised("quick-design-v1", "DESIGN", "Quick Design fix (V1)"),
    ];
    render({ items, categories: CUSTOM });

    click(tabButton("Quick Design fix (V1)"));
    expect(articleCount()).toBe(2);
    click(tabButton("Content tweak"));
    expect(articleCount()).toBe(1);
  });

  it("shows a renamed category's NEW name on requests already raised under it", () => {
    const renamed: IntakeCategory[] = [
      { id: "content-tweak", label: "Copy change", mapsTo: "TASK" },
    ];
    render({
      items: [categorised("content-tweak", "TASK", "Content tweak")],
      categories: renamed,
    });
    expect(host.textContent).toContain("Copy change");
    expect(host.textContent).not.toContain("Content tweak");
  });

  it("keeps a deleted category's original wording rather than rewriting it to a type", () => {
    render({
      items: [categorised("gone", "TASK", "Retired category")],
      categories: CUSTOM,
    });
    expect(host.textContent).toContain("Retired category");
  });

  it("still tabs legacy requests that predate custom categories", () => {
    // No categoryId — falls back to matching the underlying type, and the
    // default ids ARE the type names, so nothing falls out of its tab.
    render({ items: [makeItem("legacy", "BUG")], categories: CUSTOM });
    click(tabButton("Bug"));
    expect(articleCount()).toBe(1);
  });
});

describe("WikiIntakeSection — the category picker is a dropdown", () => {
  /** The form's category control, distinguished from the priority/label
   *  selects by its aria-label. */
  function categorySelect(): HTMLSelectElement {
    const el = host.querySelector<HTMLSelectElement>('select[aria-label="Category"]');
    if (!el) throw new Error("No category select in the Add Request form");
    return el;
  }

  it("offers every one of the client's categories as an option, in order", () => {
    const custom: IntakeCategory[] = [
      { id: "bug", label: "Bug", mapsTo: "BUG" },
      { id: "content-tweak", label: "Content tweak", mapsTo: "TASK" },
      { id: "quick-design-v1", label: "Quick Design fix (V1)", mapsTo: "DESIGN" },
      { id: "quick-tech-v1", label: "Quick Tech fix (V1)", mapsTo: "TASK" },
    ];
    render({ items: [], categories: custom });

    const options = Array.from(categorySelect().options);
    expect(options.map((o) => o.value)).toEqual(custom.map((c) => c.id));
    expect(options.map((o) => o.textContent)).toEqual(custom.map((c) => c.label));
  });

  it("defaults to the client's first category", () => {
    const custom: IntakeCategory[] = [
      { id: "content-tweak", label: "Content tweak", mapsTo: "TASK" },
      { id: "bug", label: "Bug", mapsTo: "BUG" },
    ];
    render({ items: [], categories: custom });
    expect(categorySelect().value).toBe("content-tweak");
  });

  it("does not render the old pill grid for categories", () => {
    render({ items: [], categories: DEFAULT_INTAKE_CATEGORIES });
    // The only remaining category buttons are the filter tabs (rounded-full).
    const categoryPills = Array.from(host.querySelectorAll("button")).filter(
      (b) => b.className.includes("rounded-[8px]") && b.textContent?.trim() === "Feedback",
    );
    expect(categoryPills).toHaveLength(0);
  });
});
