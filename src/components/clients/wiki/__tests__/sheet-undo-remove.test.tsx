/**
 * Removing sheet rows: the team gets an Undo toast instead of a confirm, the client still
 * confirms (they cannot restore), and Undo runs the existing restore — the soft-delete inverse.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WikiSheet, WikiSheetRow } from "@/types/wiki-sheets";
import { ToastProvider } from "@/components/ui/toast";

const calls = vi.hoisted(() => ({ bulk: [] as unknown[][] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/hooks/use-tasks", () => ({ useFeatureBlocks: () => ({ data: [] }) }));
vi.mock("@/lib/api", () => ({
  updateWikiSheetCellsApi: vi.fn(async () => {}),
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
  updateWikiSheetColumnApi: vi.fn(async () => ({})),
  setWikiSheetsEnabledApi: vi.fn(),
  reorderWikiSheetRowsApi: vi.fn(async () => ({})),
  setWikiSheetRowHeightApi: vi.fn(async () => ({ saved: true })),
  getWikiSheetPeopleApi: vi.fn(async () => ({ people: [] })),
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

function r(id: string, item: string, over: Partial<WikiSheetRow> = {}): WikiSheetRow {
  return {
    id, orderKey: 0, cells: { item }, taskId: null, stage: null, assignees: [], task: null, height: null,
    createdByKind: "TEAM", createdByName: null, createdByWikiUserId: null, mine: false,
    updatedByKind: null, updatedByName: null, deletedAt: null, updatedAt: "", ...over,
  };
}

const SHEET: WikiSheet = {
  id: "s1",
  title: "Content to build",
  description: null,
  orderKey: 0,
  columns: [{ id: "item", title: "Item", type: "text", clientEditable: true }],
  titleColumnId: "item",
  clientCanEdit: true,
  clientCanAddRows: true,
  clientCanSendToBoard: false,
  rows: [r("r1", "Pricing page"), r("r2", "Blog", { createdByKind: "CLIENT", mine: true })],
  updatedAt: "",
};

let root: Root | null = null;
let host: HTMLDivElement;

function mount(mode: "internal" | "public") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <WikiSheetsSectionView
            slug="northwind"
            token="tok"
            clientId="c1"
            section={{ enabled: true, sheets: [SHEET] }}
            mode={mode}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  calls.bulk = [];
  vi.restoreAllMocks();
});

const buttonNamed = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label);

async function selectFirstAndRemove() {
  const box = host.querySelector<HTMLInputElement>('[data-sheet-scroller] input[type="checkbox"][aria-label^="Select row"]')!;
  act(() => box.click());
  const remove = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.trim().startsWith("Remove "),
  )!;
  await act(async () => remove.click());
}

describe("removing sheet rows", () => {
  it("the team removes without a confirm, and Undo restores the same rows", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount("internal");
    await selectFirstAndRemove();
    expect(confirm).not.toHaveBeenCalled();
    expect(calls.bulk).toHaveLength(1);
    expect(calls.bulk[0][2]).toMatchObject({ action: "delete", rowIds: ["r1"] });

    const toast = document.body.querySelector("[data-undo-toast]");
    expect(toast?.textContent).toContain("1 row removed");
    await act(async () => buttonNamed("Undo")!.click());
    expect(calls.bulk).toHaveLength(2);
    expect(calls.bulk[1][2]).toMatchObject({ action: "restore", rowIds: ["r1"] });
    expect(document.body.querySelector("[data-undo-toast]")?.textContent).toContain("Restored successfully");
  });

  it("a client still confirms, and gets no Undo (they cannot restore)", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount("public");
    await selectFirstAndRemove();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(calls.bulk[0][2]).toMatchObject({ action: "delete", rowIds: ["r2"] });
    expect(buttonNamed("Undo")).toBeUndefined();
  });
});
