/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const setMode = vi.fn();
let state: { mode: "light" | "system" | "dark"; resolved: "light" | "dark" } = { mode: "light", resolved: "light" };
vi.mock("@/components/providers/theme-provider", () => ({ useTheme: () => ({ ...state, setMode }) }));
const play = vi.fn();
vi.mock("@/lib/mode-switch-sounds", () => ({ playModeSound: (m: string) => play(m) }));

import { ModeSwitch, knobGlyph } from "@/components/ui/mode-switch/mode-switch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  setMode.mockReset();
  play.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const render = () => act(() => root.render(<ModeSwitch />));
const radios = () => [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')];

describe("knobGlyph", () => {
  it("shows the sun for light and the moon for dark", () => {
    expect(knobGlyph("light", "dark")).toBe("sun");
    expect(knobGlyph("dark", "light")).toBe("moon");
  });
  it("on System, shows whatever the device is using", () => {
    expect(knobGlyph("system", "light")).toBe("sun");
    expect(knobGlyph("system", "dark")).toBe("moon");
  });
});

describe("ModeSwitch", () => {
  it("is a radio group of Light, System and Dark, in that order", () => {
    state = { mode: "system", resolved: "dark" };
    render();
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe("Theme");
    expect(radios().map((r) => r.getAttribute("aria-label"))).toEqual(["Light theme", "System theme", "Dark theme"]);
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    // The knob sits on the middle stop and wears the moon, because the device is dark.
    const group = host.querySelector<HTMLElement>(".mode-switch")!;
    expect(group.style.getPropertyValue("--i")).toBe("1");
    expect(group.dataset.glyph).toBe("moon");
  });

  it("sets the mode and plays its sound on click, and does nothing for the current one", () => {
    state = { mode: "light", resolved: "light" };
    render();
    act(() => radios()[0].click());
    expect(setMode).not.toHaveBeenCalled();
    act(() => radios()[2].click());
    expect(setMode).toHaveBeenCalledWith("dark");
    expect(play).toHaveBeenCalledWith("dark");
  });

  it("moves with the arrow keys, wrapping round", () => {
    state = { mode: "light", resolved: "light" };
    render();
    const group = host.querySelector('[role="radiogroup"]')!;
    act(() => group.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(setMode).toHaveBeenLastCalledWith("dark");
    act(() => group.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(setMode).toHaveBeenLastCalledWith("system");
  });

  it("gives each switch its own gradient ids, so two on a page don't share artwork", () => {
    state = { mode: "light", resolved: "light" };
    act(() => root.render(<><ModeSwitch /><ModeSwitch /></>));
    const ids = [...host.querySelectorAll("radialGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });
});
