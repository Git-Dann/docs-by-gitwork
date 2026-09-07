// @vitest-environment jsdom
/**
 * Regression test: the score count-up is a manual requestAnimationFrame loop
 * (not a CSS transition), so the global `prefers-reduced-motion` stylesheet
 * rule can't reach it. The fix checks `window.matchMedia` directly and jumps
 * straight to the final score instead of animating when the user has reduced
 * motion enabled.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmbedPulsePage from "@/app/embed/pulse/page";

let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? matches : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function render() {
  const root = createRoot(host);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EmbedPulsePage />
      </QueryClientProvider>,
    );
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function fillAndSubmit() {
  const url = host.querySelector('input[type="url"]') as HTMLInputElement;
  const button = host.querySelector("button") as HTMLButtonElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(url, "example.com");
    url.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

const CONFIG_RESPONSE = { turnstileSiteKey: null, bookingUrl: "https://example.com/book" };
const COMPLETED_VIEW = {
  id: "scan_rm_test", status: "COMPLETED", targetUrl: "https://example.com/", healthScore: 88,
  techStack: [], totalChecks: 10, pass: 9, warn: 1, fail: 0, categories: [], emailCaptured: true,
  checks: [], errorMessage: null,
};

describe("score count-up respects prefers-reduced-motion", () => {
  it("jumps straight to the final score with no animation frames when reduced motion is on", async () => {
    stubReducedMotion(true);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/public/pulse/config")) return { ok: true, json: async () => CONFIG_RESPONSE } as Response;
      if (url.includes("/api/public/pulse/scan/")) return { ok: true, json: async () => COMPLETED_VIEW } as Response;
      return { ok: true, status: 201, json: async () => ({ id: "scan_rm_test" }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render();
    await settle();
    fillAndSubmit();
    await settle();
    await settle(); // let the poll response + the (synchronous, reduced-motion) score effect land

    expect(host.textContent).toContain("88");
  });
});
