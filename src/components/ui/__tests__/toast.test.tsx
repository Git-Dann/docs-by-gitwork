// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_DURATION, DEFAULT_DURATION, ToastProvider, useToast } from "@/components/ui/toast";
import { RESTORED_HOLD_MS } from "@/components/ui/easyui/undo-toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Exit animations are framer-motion's business and never finish in jsdom, so presence is
// made immediate here; reduced motion is driven by a flag rather than matchMedia, which
// framer reads once per process.
const motionFlags = vi.hoisted(() => ({ reduce: false }));
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    useReducedMotion: () => motionFlags.reduce,
  };
});

type Api = ReturnType<typeof useToast>;
let api: Api;
function Capture() {
  api = useToast();
  return null;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <ToastProvider>
        <Capture />
      </ToastProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  motionFlags.reduce = false;
});

/** The Undo toast is a framer-motion card; once removed it may linger while its exit
 *  animation runs, so "gone" means advancing past that and then looking. */
const undoToasts = () => [...host.querySelectorAll<HTMLElement>("[data-undo-toast]")];
const plainToasts = () => [...host.querySelectorAll<HTMLElement>(".gitwork-toast")];
const undoButton = () =>
  [...host.querySelectorAll<HTMLButtonElement>("[data-undo-toast] button")].find((b) => b.textContent === "Undo");
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const settle = () => advance(1000);

describe("undo toast (EasyUI, vendored)", () => {
  it("renders the title, description, an Undo button and the countdown bar in the live region", () => {
    act(() => api.undo("Request marked dealt with", () => {}, { description: "Leaderboard defaults to NR" }));
    const [card] = undoToasts();
    expect(card.getAttribute("role")).toBe("status");
    expect(card.textContent).toContain("Request marked dealt with");
    expect(card.textContent).toContain("Leaderboard defaults to NR");
    expect(undoButton()).toBeDefined();
    expect(host.querySelector("[aria-live='polite']")?.contains(card)).toBe(true);
    // One live region, not two nested — the card must not announce itself a second time.
    expect(card.hasAttribute("aria-live")).toBe(false);
    expect(card.querySelector("[data-undo-progress]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("stays up longer than a plain toast", () => {
    act(() => api.success("Saved"));
    act(() => api.undo("Row removed", () => {}));
    advance(DEFAULT_DURATION + 10);
    settle();
    expect(plainToasts()).toHaveLength(0);
    expect(undoToasts()).toHaveLength(1);
    advance(ACTION_DURATION);
    settle();
    expect(undoToasts()).toHaveLength(0);
  });

  it("Undo runs the inverse once, says Restored, then leaves", async () => {
    const onUndo = vi.fn();
    act(() => api.undo("Closed", onUndo));
    await act(async () => undoButton()!.click());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(undoToasts()[0].textContent).toContain("Restored successfully");
    expect(undoButton()).toBeUndefined();
    advance(RESTORED_HOLD_MS + 10);
    settle();
    expect(undoToasts()).toHaveLength(0);
  });

  it("timing out does NOT call the inverse — the action already happened", () => {
    const onUndo = vi.fn();
    act(() => api.undo("Closed", onUndo));
    advance(ACTION_DURATION + 10);
    settle();
    expect(undoToasts()).toHaveLength(0);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("pauses while hovered and resumes with the time it had left", () => {
    act(() => api.undo("Closed", () => {}));
    advance(ACTION_DURATION - 1000);
    const card = undoToasts()[0];
    act(() => card.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(card.dataset.paused).toBe("true");
    advance(60_000);
    expect(undoToasts()).toHaveLength(1);
    act(() => card.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })));
    expect(card.dataset.paused).toBe("false");
    advance(900);
    expect(undoToasts()).toHaveLength(1);
    advance(200);
    settle();
    expect(undoToasts()).toHaveLength(0);
  });

  it("pauses while focus is inside it, so a keyboard user is not racing the clock", () => {
    act(() => api.undo("Closed", () => {}));
    act(() => undoButton()!.focus());
    expect(undoToasts()[0].dataset.paused).toBe("true");
    advance(ACTION_DURATION * 3);
    expect(undoToasts()).toHaveLength(1);
    act(() => undoButton()!.blur());
    advance(ACTION_DURATION + 10);
    settle();
    expect(undoToasts()).toHaveLength(0);
  });

  it("Escape closes a focused toast without undoing", () => {
    const onUndo = vi.fn();
    act(() => api.undo("Closed", onUndo));
    act(() => undoButton()!.focus());
    act(() => {
      undoButton()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    settle();
    expect(undoToasts()).toHaveLength(0);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("a failed undo does not claim success: it closes and says so in an error toast", async () => {
    act(() => api.undo("Closed", () => Promise.reject(new Error("Server said no"))));
    await act(async () => undoButton()!.click());
    settle();
    expect(host.textContent).not.toContain("Restored successfully");
    expect(undoToasts()).toHaveLength(0);
    expect(plainToasts()[0].textContent).toContain("Couldn't undo");
    expect(plainToasts()[0].textContent).toContain("Server said no");
  });

  it("stays up while its undo is in flight", async () => {
    let resolve!: () => void;
    act(() => api.undo("Closed", () => new Promise<void>((r) => (resolve = r))));
    act(() => undoButton()!.click());
    expect(undoButton()!.disabled).toBe(true);
    advance(ACTION_DURATION * 2);
    expect(undoToasts()).toHaveLength(1);
    await act(async () => resolve());
    expect(undoToasts()[0].textContent).toContain("Restored successfully");
  });

  it("plain toasts are not undo toasts", () => {
    act(() => api.info("Heads up"));
    expect(undoToasts()).toHaveLength(0);
    expect(plainToasts()).toHaveLength(1);
  });
});

describe("undo toast under prefers-reduced-motion", () => {
  it("drops the countdown bar but keeps the timer", () => {
    motionFlags.reduce = true;
    act(() => api.undo("Closed", () => {}));
    expect(undoToasts()[0].querySelector("[data-undo-progress]")).toBeNull();
    advance(ACTION_DURATION + 10);
    settle();
    expect(undoToasts()).toHaveLength(0);
  });
});
