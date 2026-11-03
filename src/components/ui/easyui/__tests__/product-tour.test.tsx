// @vitest-environment jsdom
/**
 * EasyUI's Product Tour as Foundry uses it: a labelled dialog, keyboard navigation, every
 * way out reported with its reason, and nothing rendered for an empty tour.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ProductTour, type TourStep } from "../product-tour";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has neither; the tour measures its card with both.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const steps: TourStep[] = [
  { title: "Welcome", body: "First" },
  { title: "Second stop", body: "Second" },
];

async function mount(el: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(el));
  await act(async () => new Promise((r) => setTimeout(r, 20)));
  return root;
}

const key = async (k: string) =>
  act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
    await new Promise((r) => setTimeout(r, 20));
  });

describe("ProductTour (vendored)", () => {
  it("is a dialog named by its label", async () => {
    document.body.innerHTML = "";
    await mount(<ProductTour open steps={steps} onClose={() => {}} label="Staff tour" />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Staff tour");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).toContain("1 of 2");
  });

  it("→ moves on, and Next on the last step finishes with 'done'", async () => {
    document.body.innerHTML = "";
    const onClose = vi.fn();
    await mount(<ProductTour open steps={steps} onClose={onClose} />);
    await key("ArrowRight");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("2 of 2");
    const done = [...document.querySelectorAll("button")].find((b) => b.textContent === "Done")!;
    await act(async () => done.click());
    expect(onClose).toHaveBeenCalledWith("done");
  });

  it("Escape dismisses and Skip skips, each reported as such", async () => {
    document.body.innerHTML = "";
    const onClose = vi.fn();
    await mount(<ProductTour open steps={steps} onClose={onClose} />);
    await key("Escape");
    expect(onClose).toHaveBeenLastCalledWith("dismiss");
    const skip = [...document.querySelectorAll("button")].find((b) => b.textContent === "Skip")!;
    await act(async () => skip.click());
    expect(onClose).toHaveBeenLastCalledWith("skip");
  });

  it("renders nothing for an empty tour", async () => {
    document.body.innerHTML = "";
    await mount(<ProductTour open steps={[]} onClose={() => {}} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("uses Foundry's tokens, not upstream's neutral greys", async () => {
    document.body.innerHTML = "";
    await mount(<ProductTour open steps={steps} onClose={() => {}} />);
    expect(document.body.innerHTML).not.toMatch(/neutral-\d/);
    const next = [...document.querySelectorAll("button")].find((b) => b.textContent === "Next")!;
    // The primary button's colours in both themes, on EasyUI's own size.
    expect(next.className).toContain("bg-[var(--brand-700)]");
    expect(next.className).toContain("dark:text-[#0B0B0C]");
  });
});
