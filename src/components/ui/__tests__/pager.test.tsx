// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Pager, pageWindow } from "@/components/ui/pager";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("pageWindow", () => {
  it("shows every page when there are seven or fewer", () => {
    expect(pageWindow(0, 3)).toEqual([0, 1, 2]);
  });
  it("keeps first, last and the neighbours of the current page, with gaps marked", () => {
    expect(pageWindow(5, 12)).toEqual([0, "…", 4, 5, 6, "…", 11]);
  });
  it("near either end it does not leave a one-page gap", () => {
    expect(pageWindow(0, 12)).toEqual([0, 1, 2, 3, "…", 11]);
    expect(pageWindow(11, 12)).toEqual([0, "…", 8, 9, 10, 11]);
  });
  it("never more than seven slots", () => {
    for (let pages = 1; pages <= 40; pages++)
      for (let p = 0; p < pages; p++) expect(pageWindow(p, pages).length).toBeLessThanOrEqual(7);
  });
});

describe("Pager", () => {
  function render(props: Parameters<typeof Pager>[0]) {
    const el = document.createElement("div");
    act(() => createRoot(el).render(<Pager {...props} />));
    return el;
  }

  it("45 scans at 20 a page: '21–40 of 45' and three page buttons", () => {
    const el = render({ page: 1, pageSize: 20, total: 45, onPage: () => {} });
    expect(el.textContent).toContain("21–40 of 45");
    expect([...el.querySelectorAll("button[aria-label^='Page ']")].map((b) => b.textContent)).toEqual(["1", "2", "3"]);
    expect(el.querySelector("[aria-current='page']")?.textContent).toBe("2");
  });

  it("renders nothing when everything fits on one page", () => {
    expect(render({ page: 0, pageSize: 20, total: 20, onPage: () => {} }).innerHTML).toBe("");
  });

  it("the arrows go one page either way and stop at the ends", () => {
    const calls: number[] = [];
    const el = render({ page: 0, pageSize: 20, total: 45, onPage: (p) => calls.push(p) });
    const prev = el.querySelector<HTMLButtonElement>("[aria-label='Previous page']")!;
    expect(prev.disabled).toBe(true);
    act(() => el.querySelector<HTMLButtonElement>("[aria-label='Next page']")!.click());
    expect(calls).toEqual([1]);
  });
});
