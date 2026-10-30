// @vitest-environment jsdom
/**
 * The Halloween spider must not break: it arrives, drops on a click, climbs back by itself,
 * survives being clicked over and over, and only ever hangs where there is a gutter for it.
 */
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HalloweenSpider } from "../halloween-spider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<HalloweenSpider />));
  const button = () => host.querySelector("button") as HTMLButtonElement;
  return { host, root, button };
}

const click = (b: HTMLButtonElement) => act(async () => b.click());
const wait = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

describe("Halloween spider", () => {
  it("drops on a click and climbs back by itself", async () => {
    const { button } = await mount();
    await wait(1300);
    expect(button().getAttribute("aria-label")).toBe("Drop the spider");
    await click(button());
    expect(button().getAttribute("aria-label")).toBe("Send the spider back up");
    await wait(4900);
    expect(button().getAttribute("aria-label")).toBe("Send the spider back up");
    await wait(200);
    expect(button().getAttribute("aria-label")).toBe("Drop the spider");
  });

  it("a second click sends it straight back up, and the climb timer doesn't fire late", async () => {
    const { button } = await mount();
    await wait(1300);
    await click(button());
    await click(button());
    expect(button().getAttribute("aria-label")).toBe("Drop the spider");
    await wait(6000);
    expect(button().getAttribute("aria-label")).toBe("Drop the spider");
  });

  it("survives being hammered", async () => {
    const { button } = await mount();
    await wait(1300);
    for (let i = 0; i < 25; i++) await click(button());
    // Odd number of clicks: it ends dropped, then climbs back on its own.
    expect(button().getAttribute("aria-label")).toBe("Send the spider back up");
    await wait(5100);
    expect(button().getAttribute("aria-label")).toBe("Drop the spider");
  });

  it("unmounting mid-drop leaves no timer behind", async () => {
    const { root, button } = await mount();
    await wait(1300);
    await click(button());
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is a real button, desktop only, never printed, and only the spider takes clicks", async () => {
    const { host, button } = await mount();
    const frame = host.firstElementChild as HTMLElement;
    expect(frame.className).toContain("hidden lg:block");
    expect(frame.className).toContain("print:hidden");
    expect(frame.className).toContain("pointer-events-none");
    expect(button().className).toContain("pointer-events-auto");
    expect(button().type).toBe("button");
    expect(host.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("hangs only where the shell draws its header band (the band's gutter is where it lives)", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain("{hideContentHeader ? null : <HalloweenSpiderSlot />}");
    // Not on the public sales demos.
    expect(readFileSync("src/components/demo/demo-shell.tsx", "utf8")).not.toContain("HalloweenSpiderSlot");
  });
});
