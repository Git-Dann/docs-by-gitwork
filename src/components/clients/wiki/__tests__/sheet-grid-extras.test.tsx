/**
 * §73.1 in the real grid (jsdom, fetchers mocked at the module edge): drag/keyboard row
 * reordering (team only, never while filtered), column/row resizing (the team's saved, the
 * client's local), the people picker, media cells and their viewer, the Board tracker and
 * its filters, the fast truncation tooltip, and automatic column widths.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SheetRowTask, WikiSheet, WikiSheetRow } from "@/types/wiki-sheets";

const calls = vi.hoisted(() => ({
  cells: [] as unknown[][],
  reorder: [] as unknown[][],
  heights: [] as unknown[][],
  widths: [] as unknown[][],
  reorderFails: false,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/hooks/use-tasks", () => ({ useFeatureBlocks: () => ({ data: [] }) }));
vi.mock("@/lib/api", () => ({
  updateWikiSheetCellsApi: vi.fn(async (...args: unknown[]) => void calls.cells.push(args)),
  bulkWikiSheetRowsApi: vi.fn(async () => ({ results: [] })),
  addWikiSheetRowsApi: vi.fn(async () => ({ rowIds: ["new"] })),
  addWikiSheetColumnsApi: vi.fn(),
  createWikiSheetApi: vi.fn(),
  deleteWikiSheetApi: vi.fn(),
  removeWikiSheetColumnApi: vi.fn(),
  updateWikiSheetApi: vi.fn(),
  updateWikiSheetColumnApi: vi.fn(async (...args: unknown[]) => {
    calls.widths.push(args);
    return {};
  }),
  setWikiSheetsEnabledApi: vi.fn(),
  reorderWikiSheetRowsApi: vi.fn(async (...args: unknown[]) => {
    calls.reorder.push(args);
    if (calls.reorderFails) throw new Error("server said no");
    return {};
  }),
  setWikiSheetRowHeightApi: vi.fn(async (...args: unknown[]) => {
    calls.heights.push(args);
    return { saved: true };
  }),
  getWikiSheetPeopleApi: vi.fn(async () => ({
    people: [
      { id: "client:u-priya", name: "Priya Shah", kind: "CLIENT" },
      { id: "team:u-sam", name: "Sam Okafor", kind: "TEAM" },
    ],
  })),
}));

import { WikiSheetsSectionView } from "../wiki-sheets-section";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Async, like a browser's: Headless UI re-schedules frames from inside a frame callback, so a
  // synchronous stand-in recurses forever.
  (window as unknown as { requestAnimationFrame: (cb: () => void) => number }).requestAnimationFrame = (cb) =>
    setTimeout(cb, 0) as unknown as number;
  (window as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame = (id) => clearTimeout(id);
  // Headless UI's anchored panels measure the page; jsdom has no ResizeObserver.
  const g = globalThis as { ResizeObserver?: unknown };
  if (!g.ResizeObserver) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const TASK = (over: Partial<SheetRowTask> = {}): SheetRowTask => ({
  title: "Pricing page task",
  assignees: [{ name: "Waqar Ali", initials: "WA" }],
  dueDate: "2020-01-01",
  updatedAt: new Date().toISOString(),
  startedAt: null,
  completedAt: null,
  ...over,
});

function r(id: string, cells: WikiSheetRow["cells"], over: Partial<WikiSheetRow> = {}): WikiSheetRow {
  return {
    id,
    orderKey: 0,
    cells,
    taskId: null,
    stage: null,
    assignees: [],
    task: null,
    height: null,
    createdByKind: "TEAM",
    createdByName: null,
    createdByWikiUserId: null,
    mine: false,
    updatedByKind: null,
    updatedByName: null,
    deletedAt: null,
    updatedAt: "",
    ...over,
  };
}

function sheet(over: Partial<WikiSheet> = {}): WikiSheet {
  return {
    id: "s1",
    title: "Content to build",
    description: null,
    orderKey: 0,
    columns: [
      { id: "item", title: "Item", type: "text", clientEditable: true },
      { id: "ref", title: "Ref", type: "text", clientEditable: true },
      { id: "who", title: "Owner", type: "person", clientEditable: true },
      { id: "media", title: "Media", type: "media", clientEditable: true },
    ],
    titleColumnId: "item",
    clientCanEdit: true,
    clientCanAddRows: true,
    clientCanSendToBoard: false,
    rows: [
      r(
        "r1",
        {
          item: "Pricing page",
          ref: "01",
          who: { id: "client:u-priya", name: "Priya Shah", kind: "CLIENT" },
          media: [
            { url: "https://cdn.example.com/hero.png", title: "Hero" },
            { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
            { url: "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ" },
          ],
        },
        { taskId: "t1", stage: "IN_PROGRESS", task: TASK(), assignees: ["Waqar Ali"] },
      ),
      r("r2", { item: "Blog", ref: "02", who: "Tom Riley" }, { taskId: "t2", stage: "SCHEDULED", task: TASK({ assignees: [], dueDate: null }) }),
      r("r3", { item: "Map", ref: "03" }, { mine: true, createdByKind: "CLIENT" }),
    ],
    updatedAt: "",
    ...over,
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

function mount(mode: "internal" | "public", s: WikiSheet = sheet()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      React.createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        React.createElement(WikiSheetsSectionView, {
          slug: "northwind",
          token: "tok",
          clientId: "c1",
          section: { enabled: true, sheets: [s] },
          mode,
        }),
      ),
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  calls.cells = [];
  calls.reorder = [];
  calls.heights = [];
  calls.widths = [];
  calls.reorderFails = false;
  window.localStorage.clear();
});

const rows = () => [...host.querySelectorAll<HTMLElement>('[data-sheet-scroller] [role="row"]')].slice(1);
const cell = (row: number, col: number) => rows()[row].querySelectorAll<HTMLElement>('[role="gridcell"]')[col + 1];
const wait = (ms: number) => act(() => new Promise((res) => setTimeout(res, ms)));
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  });
}
function pointer(el: Element, type: string, init: MouseEventInit = {}) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
  });
}
function search(text: string) {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Search rows"]')!;
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("reordering rows", () => {
  it("the team gets a drag handle per row; the client gets none", () => {
    mount("internal");
    expect(host.querySelectorAll("[data-sheet-scroller] [data-row-handle]")).toHaveLength(3);
    act(() => root?.unmount());
    document.body.innerHTML = "";
    mount("public");
    expect(host.querySelectorAll("[data-row-handle]")).toHaveLength(0);
  });

  it("Alt+↓ moves the row and persists the whole order; the grid shows it at once", async () => {
    mount("internal");
    act(() => cell(0, 0).focus());
    key(cell(0, 0), "ArrowDown", { altKey: true });
    await wait(0);
    expect(calls.reorder[0]).toEqual(["northwind", "s1", ["r2", "r1", "r3"]]);
    expect(rows().map((x) => x.dataset.rowId)).toEqual(["r2", "r1", "r3"]);
  });

  it("a failed save puts the row back and says so", async () => {
    calls.reorderFails = true;
    mount("internal");
    act(() => cell(0, 0).focus());
    key(cell(0, 0), "ArrowDown", { altKey: true });
    await wait(0);
    expect(rows().map((x) => x.dataset.rowId)).toEqual(["r1", "r2", "r3"]);
    expect(host.textContent).toContain("Couldn't move the row");
  });

  it("is disabled while a search filters the rows — and says why", async () => {
    mount("internal");
    search("Pricing");
    const handle = host.querySelector<HTMLButtonElement>("[data-sheet-scroller] [data-row-handle]")!;
    expect(handle.disabled).toBe(true);
    expect(handle.title).toMatch(/Clear the search and filter to reorder/);
    act(() => cell(0, 0).focus());
    key(cell(0, 0), "ArrowDown", { altKey: true });
    await wait(0);
    expect(calls.reorder).toHaveLength(0);
  });

  it("a client's Alt+↓ does nothing", async () => {
    mount("public");
    act(() => cell(0, 0).focus());
    key(cell(0, 0), "ArrowDown", { altKey: true });
    await wait(0);
    expect(calls.reorder).toHaveLength(0);
  });
});

describe("resizing", () => {
  it("every column and row edge is a labelled separator", () => {
    mount("internal");
    const cols = [...host.querySelectorAll("[data-col-resize]")].map((e) => e.getAttribute("aria-label"));
    expect(cols).toEqual(["Resize column Item", "Resize column Ref", "Resize column Owner", "Resize column Media"]);
    expect(host.querySelector('[data-row-resize="r1"]')!.getAttribute("aria-label")).toBe("Resize row 1");
  });

  it("the team's drag is saved once, on pointer-up, for everyone", async () => {
    mount("internal");
    const handle = host.querySelector('[data-col-resize="item"]')!;
    const start = Number(handle.getAttribute("aria-valuenow"));
    pointer(handle, "pointerdown", { clientX: 100 });
    pointer(handle, "pointermove", { clientX: 140 });
    pointer(handle, "pointermove", { clientX: 160 });
    expect(calls.widths).toHaveLength(0); // never per move
    pointer(handle, "pointerup", { clientX: 160 });
    await wait(450);
    expect(calls.widths).toEqual([["northwind", "s1", "item", { width: start + 60 }]]);
  });

  it("a client's drag stays in their browser — nothing is sent", async () => {
    mount("public");
    const handle = host.querySelector('[data-col-resize="item"]')!;
    pointer(handle, "pointerdown", { clientX: 100 });
    pointer(handle, "pointermove", { clientX: 150 });
    pointer(handle, "pointerup", { clientX: 150 });
    await wait(450);
    expect(calls.widths).toHaveLength(0);
    expect(window.localStorage.getItem("foundry.wiki.sheet.layout.v1.s1")).toContain('"item"');
  });

  it("double-click a row edge resets the team's height to auto", async () => {
    mount("internal", sheet({ rows: [r("r1", { item: "A" }, { height: 90 })] }));
    expect(rows()[0].style.height).toBe("90px");
    act(() => void host.querySelector('[data-row-resize="r1"]')!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await wait(450);
    expect(calls.heights).toEqual([["northwind", "s1", "r1", null]]);
    expect(rows()[0].style.height).toBe("");
  });
});

describe("automatic column widths", () => {
  it("a short REF column comes out narrow; a saved width wins", () => {
    mount("internal", sheet({ columns: [...sheet().columns.slice(0, 2).map((c) => (c.id === "item" ? { ...c, width: 333 } : c))] }));
    const tpl = rows()[0].style.gridTemplateColumns.split(" ");
    expect(tpl[1]).toBe("333px"); // saved
    expect(parseInt(tpl[2], 10)).toBeLessThanOrEqual(80); // "01, 02, 03"
  });
});

describe("people", () => {
  it("a picked person reads as initials + name; legacy text reads as text", () => {
    mount("internal");
    const chip = cell(0, 2).querySelector("[data-person-chip]")!;
    expect(chip.textContent).toBe("PSPriya Shah");
    expect(cell(1, 2).querySelector("[data-person-text]")!.textContent).toBe("Tom Riley");
  });

  it("the picker offers the directory and stores the structured person", async () => {
    mount("internal");
    await wait(10); // the people query
    const c = cell(2, 2);
    act(() => c.focus());
    key(c, "Enter");
    const input = c.querySelector<HTMLInputElement>('input[aria-label="Owner"]')!;
    expect(input).toBeTruthy();
    expect(input.className).toContain("text-base"); // 16px on a phone
    await wait(20);
    const options = [...document.querySelectorAll('[role="option"]')];
    expect(options.map((o) => o.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Priya Shah"), expect.stringContaining("Sam Okafor")]));
    const sam = options.find((o) => o.textContent?.includes("Sam Okafor"))!;
    await act(async () => {
      // Headless UI selects an option on mousedown (so the input never blurs).
      sam.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    await wait(10);
    expect(calls.cells.at(-1)).toEqual([{ mode: "internal", slug: "northwind" }, "s1", "r3", { who: { id: "team:u-sam", name: "Sam Okafor", kind: "TEAM" } }]);
  });
});

describe("media", () => {
  it("chips show a kind icon and a tidy title — never the raw URL — with +N past what fits", () => {
    mount("internal");
    const chips = [...cell(0, 3).querySelectorAll<HTMLElement>("[data-media-chip]")];
    expect(chips[0].textContent).toBe("Hero");
    expect(chips[0].querySelector("[data-media-kind]")!.getAttribute("data-media-kind")).toBe("image");
    expect(chips[0].title).toContain("Hero");
    expect(cell(0, 3).textContent).not.toContain("https://");
    expect(cell(0, 3).textContent).toMatch(/\+\d/);
  });

  it("the viewer shows an image inline, embeds an allow-listed player, and NEVER frames a lookalike host", () => {
    mount("internal");
    act(() => cell(0, 3).querySelector<HTMLElement>("[data-media-chip]")!.click());
    const dialog = () => document.querySelector('[role="dialog"]')!;
    expect(dialog().querySelector('[data-media-view="image"]')!.getAttribute("src")).toBe("https://cdn.example.com/hero.png");
    key(document.body, "ArrowRight");
    const frame = dialog().querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
    key(document.body, "ArrowRight");
    expect(dialog().querySelector("iframe")).toBeNull(); // youtube.com.evil.com: no embed
    expect(dialog().querySelector('[data-media-view="link"]')).toBeTruthy();
    const original = [...dialog().querySelectorAll("a")].find((a) => a.textContent?.includes("Open original"))!;
    expect(original.rel).toBe("noopener noreferrer");
    expect(original.target).toBe("_blank");
  });

  it("pasting a URL into a selected media cell adds it", async () => {
    mount("internal");
    const c = cell(2, 3);
    act(() => c.focus());
    await act(async () => {
      const e = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
      e.clipboardData = { getData: () => "https://www.loom.com/share/0123456789abcdef0123456789abcdef" };
      c.dispatchEvent(e);
    });
    expect(calls.cells.at(-1)?.[3]).toEqual({ media: [{ url: "https://www.loom.com/share/0123456789abcdef0123456789abcdef" }] });
  });
});

describe("the Board column tracker", () => {
  it("shows stage, who is on it and an overdue due date; a linked row with nobody reads Unassigned", () => {
    mount("internal");
    const board1 = rows()[0].querySelector("[data-board-trigger]")!;
    expect(board1.textContent).toContain("In progress");
    expect(board1.textContent).toContain("Waqar");
    expect(board1.querySelector('[data-due="overdue"]')).toBeTruthy();
    expect(rows()[1].querySelector("[data-board-trigger]")!.textContent).toContain("Unassigned");
  });

  it("tap opens the popover; the team gets the board link, the client never does", () => {
    mount("internal");
    act(() => rows()[0].querySelector<HTMLElement>("[data-board-trigger]")!.click());
    const pop = document.querySelector("[data-board-popover]")!;
    expect(pop.textContent).toContain("Pricing page task");
    expect(pop.textContent).toContain("overdue");
    expect(pop.querySelector("[data-board-link]")).toBeTruthy();
    act(() => root?.unmount());
    document.body.innerHTML = "";
    mount("public");
    act(() => rows()[0].querySelector<HTMLElement>("[data-board-trigger]")!.click());
    expect(document.querySelector("[data-board-popover] [data-board-link]")).toBeNull();
  });

  it("a summary strip counts by stage; the assignee filter narrows the rows", () => {
    mount("internal");
    const strip = host.querySelector("[data-stage-summary]")!;
    expect(strip.textContent).toBe("1 not on board·1 scheduled·1 in progress");
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Filter by who is on it"]')!;
    act(() => {
      select.value = "__unassigned__";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(rows().map((x) => x.dataset.rowId)).toEqual(["r2"]);
  });
});

describe("the truncation tooltip", () => {
  it("text cells carry their full value for the custom tooltip, not a slow native title", () => {
    mount("internal");
    const span = cell(0, 0).querySelector("[data-full-text]")!;
    expect(span.getAttribute("data-full-text")).toBe("Pricing page");
    expect(span.getAttribute("title")).toBeNull();
  });

  it("appears after ~150ms, only when the value is cut off, and only for a mouse", async () => {
    mount("internal");
    const c = cell(0, 0);
    const span = c.querySelector<HTMLElement>("[data-full-text]")!;
    Object.defineProperty(span, "scrollWidth", { configurable: true, get: () => 300 });
    Object.defineProperty(span, "clientWidth", { configurable: true, get: () => 100 });
    const enter = (pointerType: string) =>
      act(() => {
        const e = new MouseEvent("pointerover", { bubbles: true }) as MouseEvent & { pointerType: string };
        Object.defineProperty(e, "pointerType", { value: pointerType });
        c.dispatchEvent(e);
      });
    enter("touch");
    await wait(200);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    enter("mouse");
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await wait(200);
    const tip = document.querySelector('[role="tooltip"]')!;
    expect(tip.textContent).toBe("Pricing page");
    expect(c.getAttribute("aria-describedby")).toBe(tip.id);
  });
});

/* §73.3 — bulk set from the floating bar, and the two-pane settings dialog. */

const withPlatform = () =>
  sheet({
    columns: [
      { id: "item", title: "Item", type: "text", clientEditable: true },
      { id: "platform", title: "Platform", type: "select", options: ["iOS", "Android", "Flutter"], clientEditable: true },
      { id: "lukes", title: "Luke's notes", type: "long_text", clientEditable: false },
    ],
  });
const click = (el: Element | null | undefined) =>
  act(() => {
    (el as HTMLElement).click();
  });
const byText = (root: ParentNode, sel: string, text: string) =>
  [...root.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent?.trim().startsWith(text));

describe("bulk set from the floating batch bar", () => {
  it("floats at the bottom of the page and sets one column on every selected row", async () => {
    mount("internal", withPlatform());
    click(host.querySelector('input[aria-label="Select all rows shown"]'));
    const bar = document.body.querySelector<HTMLElement>("[data-sheet-batch-bar]")!;
    expect(bar).toBeTruthy();
    expect(host.contains(bar)).toBe(false); // portalled, so the card can't clip it
    expect(bar.className).toContain("fixed");
    click(bar.querySelector("[data-bulk-set]"));
    click(byText(document.body, '[role="menuitem"]', "Platform"));
    click(byText(document.body, '[role="menuitem"]', "iOS"));
    await wait(20);
    const writes = calls.cells.map((c) => [c[2], c[3]]);
    expect(writes).toEqual(
      expect.arrayContaining([
        ["r1", { platform: "iOS" }],
        ["r2", { platform: "iOS" }],
        ["r3", { platform: "iOS" }],
      ]),
    );
    expect(writes).toHaveLength(3);
  });

  it("offers the client only the columns they may edit", () => {
    mount("public", withPlatform());
    click(host.querySelector('input[aria-label="Select all rows shown"]'));
    const bar = document.body.querySelector<HTMLElement>("[data-sheet-batch-bar]");
    expect(bar).toBeTruthy();
    click(bar!.querySelector("[data-bulk-set]"));
    const items = [...document.body.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(items.some((t) => t?.startsWith("Platform"))).toBe(true);
    expect(items.some((t) => t?.startsWith("Luke's notes"))).toBe(false);
  });

  it("goes away when the selection is cleared", () => {
    mount("internal", withPlatform());
    click(host.querySelector('input[aria-label="Select all rows shown"]'));
    click(byText(document.body, "[data-sheet-batch-bar] button", "Clear"));
    expect(document.body.querySelector("[data-sheet-batch-bar]")).toBeNull();
  });
});

describe("sheet settings", () => {
  it("is a two-pane popup: sheet first, then one column at a time", () => {
    mount("internal", withPlatform());
    click(document.body.querySelector('button[aria-label="Sheet settings: Content to build"]'));
    const nav = document.body.querySelector<HTMLElement>('nav[aria-label="Settings sections"]')!;
    expect([...nav.querySelectorAll("button")].map((b) => b.title || b.textContent?.trim())).toEqual([
      "Sheet",
      "Item",
      "Platform",
      "Luke's notes",
    ]);
    expect(document.body.textContent).toContain("What the client can do");
    expect(document.body.querySelector('input[aria-label^="Add an option"]')).toBeNull();
    click(byText(nav, "button", "Platform"));
    expect(document.body.textContent).toContain("Options · 3");
    expect(document.body.querySelector('button[aria-label="Remove option iOS"]')).toBeTruthy();
    expect(document.body.textContent).not.toContain("What the client can do");
  });
});
