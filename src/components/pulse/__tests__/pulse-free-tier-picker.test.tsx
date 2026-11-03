// @vitest-environment jsdom
/**
 * Drives the picker the way Harry will: switch the limit on, find checks by searching,
 * tick them, save. The contract worth pinning is that NOTHING goes live until Save, that
 * the saved value is exactly what was ticked, and that "off" saves null (no limit),
 * never an empty list (which would show nothing at all on a public page).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKS_REGISTRY } from "@/server/checks-registry";

vi.mock("@/components/pulse/pulse-embed-panel", () => ({
  ToggleSwitch: ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} />
  ),
}));

import { PulseFreeTierPicker } from "../pulse-free-tier-picker";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onSave = vi.fn();

const A = CHECKS_REGISTRY[0];
const B = CHECKS_REGISTRY.find((c) => c.category !== A.category)!;

function mount(props: Partial<React.ComponentProps<typeof PulseFreeTierPicker>> = {}) {
  act(() => {
    root.render(<PulseFreeTierPicker saved={null} saving={false} error={null} onSave={onSave} {...props} />);
  });
}
const $ = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const byText = (tag: string, text: string) =>
  [...host.querySelectorAll(tag)].find((e) => e.textContent?.trim().startsWith(text)) as HTMLElement | undefined;
const click = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click(); });
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const save = () => byText("button", "Save") as HTMLButtonElement;
const discard = () => byText("button", "Discard") as HTMLButtonElement;
const box = (label: string) => [...host.querySelectorAll("label")].find((l) => l.textContent?.includes(label))!.querySelector("input") as HTMLInputElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  onSave.mockClear();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("off by default", () => {
  it("shows no picker and nothing to save", () => {
    mount();
    expect($('input[type="checkbox"]')).toBeNull();
    expect(save().disabled).toBe(true);
    expect(host.textContent).toContain("No limit");
  });

  it("turning it on without choosing anything says so plainly and can be saved", () => {
    mount();
    click($('[role="switch"]'));
    expect(host.textContent).toContain("Nothing is free");
    expect(save().disabled).toBe(false);
    click(save());
    expect(onSave).toHaveBeenCalledWith([]);
  });
});

describe("finding and choosing checks", () => {
  it("search narrows to matches and opens them; nothing saves until Save", () => {
    mount();
    click($('[role="switch"]'));
    type($('input[aria-label="Search checks"]') as HTMLInputElement, A.key);
    const boxes = host.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBeGreaterThanOrEqual(1);
    click(box(A.label));
    expect(onSave).not.toHaveBeenCalled();
    expect(host.textContent).toContain("1 of");
    expect(host.textContent).toContain("Unsaved changes");
  });

  it("saves exactly what was ticked, across categories", () => {
    mount();
    click($('[role="switch"]'));
    for (const c of [A, B]) {
      type($('input[aria-label="Search checks"]') as HTMLInputElement, c.key);
      click(box(c.label));
    }
    click(save());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0][0] as string[]).sort()).toEqual([A.key, B.key].sort());
  });

  it("a search with no match says so instead of rendering an empty box", () => {
    mount();
    click($('[role="switch"]'));
    type($('input[aria-label="Search checks"]') as HTMLInputElement, "zzzz-no-such-check");
    expect(host.textContent).toContain("No checks match");
  });

  it("'Selected only' lists just the chosen checks", () => {
    mount({ saved: [A.key] });
    click(byText("button", "Selected only"));
    const rows = host.querySelectorAll('input[type="checkbox"]');
    expect(rows).toHaveLength(1);
    expect(box(A.label).checked).toBe(true);
  });

  it("'Selected only' with nothing selected says so", () => {
    mount({ saved: [] });
    click(byText("button", "Selected only"));
    expect(host.textContent).toContain("Nothing selected yet");
  });
});

describe("saving, discarding and turning it off", () => {
  it("an existing limit starts clean — Save and Discard are disabled", () => {
    mount({ saved: [A.key, B.key] });
    expect(save().disabled).toBe(true);
    expect(discard().disabled).toBe(true);
  });

  it("Discard returns to what is saved", () => {
    mount({ saved: [A.key] });
    click(byText("button", "Selected only"));
    click(box(A.label));
    expect(save().disabled).toBe(false);
    click(discard());
    expect(box(A.label).checked).toBe(true);
    expect(save().disabled).toBe(true);
  });

  it("switching the limit OFF saves null — never an empty list", () => {
    mount({ saved: [A.key] });
    click($('[role="switch"]'));
    click(save());
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("category All / None select and clear every check in that category", () => {
    mount();
    click($('[role="switch"]'));
    type($('input[aria-label="Search checks"]') as HTMLInputElement, A.category);
    const all = byText("button", "All")!;
    click(all);
    const inCategory = CHECKS_REGISTRY.filter((c) => c.category === A.category).length;
    expect(host.textContent).toContain(`${inCategory} of`);
    click(byText("button", "None"));
    expect(host.textContent).toContain("Nothing is free");
  });

  it("re-seeds from the saved value when it changes underneath (after a save)", () => {
    mount({ saved: [A.key] });
    mount({ saved: [B.key] });
    click(byText("button", "Selected only"));
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(box(B.label).checked).toBe(true);
    expect(save().disabled).toBe(true);
  });
});

describe("feedback", () => {
  it("shows a server error and disables Save while saving", () => {
    mount({ saved: [A.key], error: "Unknown check(s): nope", saving: true });
    expect($('[role="alert"]')?.textContent).toContain("Unknown check");
    const saving = byText("button", "Saving") as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
  });

  it("never mounts all 1,600+ checkboxes at once", () => {
    mount({ saved: [] });
    click($('[role="switch"]'));
    // Every domain header is collapsed by default, so no check rows are in the DOM.
    expect(host.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });
});
