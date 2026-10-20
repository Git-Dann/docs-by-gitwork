/**
 * The Sheets grid, mounted for real (jsdom) with its fetchers mocked at the module edge.
 *
 * Pins what tsc cannot see: the grid sits in ONE scroller that holds the header and the
 * rows (`.widget-card` is overflow:hidden, §45.2) with the first column and the Board column
 * pinned; a phone gets cards, not a sideways grid; the keyboard moves and edits like a
 * spreadsheet and a commit sends exactly one cell; Escape sends nothing; and the client's
 * view offers only what the sheet allows.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WikiSheet, WikiSheetRow } from "@/types/wiki-sheets";

const calls = vi.hoisted(() => ({ cells: [] as unknown[][], bulk: [] as unknown[][] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/hooks/use-tasks", () => ({ useFeatureBlocks: () => ({ data: [] }) }));
vi.mock("@/lib/api", () => ({
  updateWikiSheetCellsApi: vi.fn(async (...args: unknown[]) => {
    calls.cells.push(args);
  }),
  bulkWikiSheetRowsApi: vi.fn(async (...args: unknown[]) => {
    calls.bulk.push(args);
    return { results: [] };
  }),
  addWikiSheetRowsApi: vi.fn(async () => ({ rowIds: ["new"] })),
  addWikiSheetColumnsApi: vi.fn(),
  createWikiSheetApi: vi.fn(),
  deleteWikiSheetApi: vi.fn(),
  removeWikiSheetColumnApi: vi.fn(),
  updateWikiSheetApi: vi.fn(),
  updateWikiSheetColumnApi: vi.fn(),
  setWikiSheetsEnabledApi: vi.fn(),
}));

import { WikiSheetsSectionView } from "../wiki-sheets-section";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!window.requestAnimationFrame) {
    (window as unknown as { requestAnimationFrame: (cb: () => void) => number }).requestAnimationFrame = (cb) => {
      cb();
      return 0;
    };
  }
});

function r(id: string, cells: WikiSheetRow["cells"], over: Partial<WikiSheetRow> = {}): WikiSheetRow {
  return {
    id,
    orderKey: 0,
    cells,
    taskId: null,
    stage: null,
    assignees: [],
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
      { id: "pri", title: "Priority", type: "select", options: ["Low", "High"], clientEditable: true },
      { id: "est", title: "Estimate", type: "number", clientEditable: false },
    ],
    titleColumnId: "item",
    clientCanEdit: true,
    clientCanAddRows: true,
    clientCanSendToBoard: false,
    rows: [
      r("r1", { item: "Pricing page", pri: "Low", est: 3 }, { taskId: "t1", stage: "IN_PROGRESS" }),
      r("r2", { item: "Blog" }, { createdByKind: "CLIENT", mine: true }),
      r("r3", { item: "Map" }),
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
        { client: new QueryClient() },
        React.createElement(WikiSheetsSectionView, {
          slug: "northwind",
          token: "tok",
          clientId: "c1",
          section: { enabled: true, sheets: [s] },
          mode,
          people: ["Priya Shah"],
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
  calls.bulk = [];
});

const cell = (row: number, col: number) =>
  host.querySelectorAll<HTMLElement>('[data-sheet-scroller] [role="row"]')[row].querySelectorAll<HTMLElement>('[role="gridcell"]')[col + 1];
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  });
}

describe("layout", () => {
  it("header and rows share ONE scroller, with the first column and Board pinned", () => {
    mount("internal");
    const scrollers = host.querySelectorAll("[data-sheet-scroller]");
    expect(scrollers).toHaveLength(1);
    const scroller = scrollers[0];
    expect(scroller.className).toContain("overflow-auto");
    const rows = scroller.querySelectorAll('[role="row"]');
    expect(rows.length).toBe(4); // header + 3
    // Both the header and the body rows are inside this one scroller (not a nested one).
    for (const row of rows) {
      // Self included: a row that scrolls on its own desyncs from the rest just the same.
      let el: Element | null = row;
      while (el && !(el as HTMLElement).dataset?.sheetScroller) {
        expect((el as HTMLElement).className ?? "").not.toMatch(/overflow-(x-)?auto/);
        el = el.parentElement;
      }
      expect(el).toBe(scroller);
    }
    expect(rows[0].className).toContain("sticky top-0");
    expect(cell(1, 0).className).toContain("sticky");
    const board = rows[1].querySelectorAll('[role="gridcell"]');
    expect(board[board.length - 1].className).toContain("sticky right-0");
  });

  it("a narrow window un-pins the columns rather than hiding the data behind them", () => {
    // 440px is the wiki's content column at a 768px viewport: pinned, 44 + 200 + 150px of
    // fixed columns would leave ~44px for everything else.
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const g = globalThis as { ResizeObserver?: unknown };
    const prevRO = g.ResizeObserver;
    g.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 440 });
    try {
      mount("internal");
      expect(cell(1, 0).className.split(/\s+/)).not.toContain("sticky");
      const rows = host.querySelectorAll('[data-sheet-scroller] [role="row"]');
      const board = rows[1].querySelectorAll('[role="gridcell"]');
      expect(board[board.length - 1].className).not.toContain("sticky right-0");
    } finally {
      if (desc) Object.defineProperty(proto, "clientWidth", desc);
      else delete proto.clientWidth;
      g.ResizeObserver = prevRO;
    }
  });

  it("a phone gets cards, not the grid", () => {
    mount("internal");
    const cls = host.querySelector("[data-sheet-scroller]")!.className.split(/\s+/);
    expect(cls).toContain("hidden");
    expect(cls).toContain("sm:block");
    const cards = host.querySelector('ul[aria-label="Content to build rows"]')!;
    expect(cards.className).toContain("sm:hidden");
    expect(cards.querySelectorAll("li")).toHaveLength(3);
  });

  it("a linked row shows its stage; an unlinked one offers Send to board", () => {
    mount("internal");
    expect(host.textContent).toContain("In progress");
    expect(host.textContent).toContain("Send to board");
  });
});

describe("keyboard", () => {
  it("arrows move the active cell", () => {
    mount("internal");
    const first = cell(1, 0);
    act(() => first.focus());
    key(first, "ArrowRight");
    expect(cell(1, 1).getAttribute("aria-selected")).toBe("true");
    key(cell(1, 1), "ArrowDown");
    expect(cell(2, 1).getAttribute("aria-selected")).toBe("true");
  });

  it("typing starts editing; Enter commits exactly that one cell", async () => {
    mount("internal");
    const c = cell(2, 0);
    act(() => c.focus());
    key(c, "Z");
    const input = c.querySelector("input")!;
    expect(input).toBeTruthy();
    expect(input.value).toBe("Z");
    expect(input.className).toContain("text-base"); // 16px on a phone: no iOS focus zoom
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(calls.cells).toHaveLength(1);
    expect(calls.cells[0]).toEqual([{ mode: "internal", slug: "northwind" }, "s1", "r2", { item: "Z" }]);
  });

  it("the first click selects a cell; a click on the selected cell edits it", () => {
    mount("internal");
    const c = cell(2, 0);
    // Three separate acts, as a browser delivers them: each discrete event re-renders before
    // the next. One act would batch them, the click would see the pre-focus state, and the
    // test would pass with the bug in place (it did — checked by sabotage).
    const press = () => {
      act(() => void c.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
      act(() => c.focus()); // focus lands on mousedown, before click — the trap
      act(() => void c.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    };
    press();
    expect(c.getAttribute("aria-selected")).toBe("true");
    expect(c.querySelector("input")).toBeNull();
    press();
    expect(c.querySelector("input")).not.toBeNull();
  });

  it("Escape cancels and sends nothing", () => {
    mount("internal");
    const c = cell(2, 0);
    act(() => c.focus());
    key(c, "Enter");
    const input = c.querySelector("input")!;
    key(input, "Escape");
    expect(c.querySelector("input")).toBeNull();
    expect(calls.cells).toHaveLength(0);
  });
});

describe("the client's view offers only what the sheet allows", () => {
  it("a locked column is read-only and won't open an editor", () => {
    mount("public");
    const est = cell(1, 2);
    expect(est.getAttribute("aria-readonly")).toBe("true");
    act(() => est.focus());
    key(est, "Enter");
    expect(est.querySelector("input")).toBeNull();
  });

  it("no structure controls, and no Send unless the team allowed it", () => {
    mount("public");
    expect(host.textContent).not.toContain("Column");
    expect(host.textContent).not.toContain("Send to board");
  });

  it("Send appears when the sheet allows it", () => {
    mount("public", sheet({ clientCanSendToBoard: true }));
    expect(host.textContent).toContain("Send to board");
  });

  it("a client can select only their own rows (or ones they may send)", () => {
    mount("public");
    const boxes = host.querySelectorAll('[data-sheet-scroller] input[type="checkbox"][aria-label^="Select row"]');
    expect(boxes).toHaveLength(1); // r2, the one they added
  });
});
