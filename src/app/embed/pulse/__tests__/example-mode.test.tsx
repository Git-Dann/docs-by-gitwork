// @vitest-environment jsdom
/**
 * Regression test for ?example=1 — a fixed, fabricated completed scan used to
 * preview the full branded results view (from Settings → Public Embed → View
 * example) without running a real scan. Reads window.location.search directly
 * rather than next/navigation's useSearchParams (which would force a Suspense
 * boundary onto this page just for an admin-only preview link).
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
  // Real matchMedia is "not implemented" in jsdom, which leaves the score
  // count-up's requestAnimationFrame loop running for real — it keeps
  // scheduling frames past this test's teardown and throws once the jsdom
  // window is gone. Reduced motion jumps straight to the final value instead.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/embed/pulse");
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

const CONFIG_RESPONSE = { turnstileSiteKey: null, bookingUrl: "https://example.com/book" };

describe("embed ?example=1", () => {
  it("shows a fabricated completed scan without polling any real scan endpoint", async () => {
    window.history.pushState({}, "", "/embed/pulse?example=1");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/public/pulse/config")) return { ok: true, json: async () => CONFIG_RESPONSE } as Response;
      throw new Error(`unexpected fetch in example mode: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render();
    await settle();
    await settle();

    expect(host.textContent).toContain("71");
    expect(host.textContent).toContain("acme-app.io");
    expect(host.textContent).toMatch(/example results/i);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/public/pulse/scan"))).toBe(false);
  });

  it("disables the form so a visitor can't accidentally submit a real scan against the fake fields", async () => {
    window.history.pushState({}, "", "/embed/pulse?example=1");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/public/pulse/config")) return { ok: true, json: async () => CONFIG_RESPONSE } as Response;
      throw new Error(`unexpected fetch in example mode: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render();
    await settle();
    await settle();

    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("does nothing special without the query param", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/public/pulse/config")) return { ok: true, json: async () => CONFIG_RESPONSE } as Response;
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render();
    await settle();

    expect(host.textContent).not.toContain("acme-app.io");
    expect(host.textContent).toMatch(/get in touch with us for the full report/i);
  });
});
