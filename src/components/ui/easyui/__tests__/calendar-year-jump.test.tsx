// @vitest-environment jsdom
/**
 * The calendar's title opens a year grid, then a month grid (Nov 2026): a date of birth
 * meant clicking back through hundreds of months.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Calendar } from "@/components/ui/easyui/calendar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no scrollIntoView.
Element.prototype.scrollIntoView = function () {};

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

async function mount(props: Record<string, unknown>) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(Calendar, { mode: "single", ...props } as never)));
  return el;
}
const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => (el as HTMLElement).click());
};
const titleButton = (el: HTMLElement) =>
  [...el.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? "").includes("Choose a month and year"));

describe("jumping to a year and month", () => {
  it("title → year → month lands on that month's days", async () => {
    const el = await mount({ defaultMonth: new Date(2026, 10, 1), locale: "en-GB" });
    await click(titleButton(el));
    await click(el.querySelector('[data-year="1990"]'));
    await click([...el.querySelectorAll('[role="option"]')].find((b) => b.textContent === "Mar"));
    expect(el.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("March 1990");
  });

  it("offers years back far enough for a date of birth, with no bounds set", async () => {
    const el = await mount({ defaultMonth: new Date(2026, 10, 1), locale: "en-GB" });
    await click(titleButton(el));
    expect(el.querySelector(`[data-year="${new Date().getFullYear() - 100}"]`)).toBeTruthy();
  });

  it("keeps to min and max", async () => {
    const el = await mount({
      defaultMonth: new Date(2026, 5, 1),
      locale: "en-GB",
      minDate: new Date(2026, 3, 10),
      maxDate: new Date(2027, 1, 5),
    });
    await click(titleButton(el));
    const years = [...el.querySelectorAll("[data-year]")].map((b) => b.getAttribute("data-year"));
    expect(years).toEqual(["2026", "2027"]);
    await click(el.querySelector('[data-year="2026"]'));
    const months = [...el.querySelectorAll('[role="option"]')] as HTMLButtonElement[];
    expect(months.find((b) => b.textContent === "Mar")?.disabled).toBe(true);
    expect(months.find((b) => b.textContent === "Apr")?.disabled).toBe(false);
  });
});
