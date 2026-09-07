// @vitest-environment jsdom
/**
 * Regression tests for the public embed's scan-status polling loop.
 *
 * Before this fix, a persistent failure (a scan row that 404s — e.g. expired or
 * never created — or a run of network/parse errors) polled forever on a fixed
 * delay with no cap and no user-visible error: the UI was stuck showing
 * "Scanning…" indefinitely. The fix stops immediately on 404 (that status can
 * never resolve by retrying) and caps other failures at MAX_POLL_FAILURES before
 * surfacing an error.
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
  vi.useFakeTimers();
  // jsdom has no ResizeObserver — the page's auto-resize effect uses one to
  // report height to the parent frame, unrelated to what these tests exercise.
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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
  act(() => {
    url.dispatchEvent(new Event("input", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(url, "example.com");
    url.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

/** Config fetch every render path makes on mount — no Turnstile key, so the
 * widget never gates on verification and the test can submit immediately. */
const CONFIG_RESPONSE = { turnstileSiteKey: null, bookingUrl: "https://example.com/book" };

describe("embed scan polling", () => {
  it("stops immediately on a 404 instead of polling forever", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/public/pulse/config")) {
        return { ok: true, json: async () => CONFIG_RESPONSE } as Response;
      }
      if (url.includes("/api/public/pulse/scan/")) {
        return { ok: false, status: 404, json: async () => ({ error: "Scan not found" }) } as Response;
      }
      // POST /api/public/pulse/scan
      return { ok: true, status: 201, json: async () => ({ id: "scan_404_test" }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render();
    await settle();
    fillAndSubmit();
    await settle();

    // First poll should already have fired and hit the 404 branch.
    expect(host.textContent).toMatch(/couldn.?t find that scan/i);
    expect(host.textContent).not.toMatch(/scanning/i);

    // Confirm it actually stopped — advancing time further must not add more
    // polling calls beyond the one 404 response already observed.
    const callsAfterFirst404 = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/scan/scan_404_test")).length;
    await act(async () => { vi.advanceTimersByTime(20_000); });
    await settle();
    const callsLater = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/scan/scan_404_test")).length;
    expect(callsLater).toBe(callsAfterFirst404);
  });

  it("caps retries on persistent network failure and surfaces an error instead of spinning forever", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/public/pulse/config")) {
        return { ok: true, json: async () => CONFIG_RESPONSE } as Response;
      }
      if (url.includes("/api/public/pulse/scan/")) {
        throw new TypeError("Failed to fetch");
      }
      return { ok: true, status: 201, json: async () => ({ id: "scan_flaky_test" }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render();
    await settle();
    fillAndSubmit();
    await settle();

    // Drive enough 2500ms backoff cycles to exceed MAX_POLL_FAILURES (40).
    for (let i = 0; i < 45; i++) {
      await act(async () => { vi.advanceTimersByTime(2500); });
      await settle();
    }

    expect(host.textContent).toMatch(/lost the connection|please try again/i);

    const pollCallCount = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/scan/scan_flaky_test")).length;
    // Bounded — not the ~45 attempts the timer advances would produce without a cap.
    expect(pollCallCount).toBeLessThan(45);
  });

  it("does not crash or show a raw parse error when the scan-start response is not JSON", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/public/pulse/config")) {
        return { ok: true, json: async () => CONFIG_RESPONSE } as Response;
      }
      // POST /api/public/pulse/scan returns an HTML error page (e.g. gateway timeout).
      return {
        ok: false,
        status: 502,
        json: async () => { throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"); },
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render();
    await settle();
    fillAndSubmit();
    await settle();

    expect(host.textContent).not.toMatch(/unexpected token|is not valid json/i);
    expect(host.textContent).toMatch(/couldn.?t start the scan/i);
  });
});
