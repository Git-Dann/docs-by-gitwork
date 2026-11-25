// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DispatchSettingsPanel } from "@/components/settings/dispatch-settings-panel";

/**
 * Settings → Dispatch, from Dan's review (25 Nov 2026):
 *   - a connected key shows only Disconnect (no input, no Save next to it);
 *   - saving one thing spins only its own button (every button used to spin at once).
 */

const base = {
  assistantEnabled: true,
  budgetUsd: 200,
  budgetSince: null,
  figmaConnected: false,
  anthropicConnected: false,
  anthropicKeyFromServer: false,
  spend: { budgetUsd: 200, spentUsd: 0.3, dispatchUsd: 0.03, source: "estimate", billedThrough: null, anthropicError: false, period: { label: "in November 2026" } },
};

let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => vi.unstubAllGlobals());

async function render(settings: Record<string, unknown>, patch?: () => Promise<unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === "PATCH" && patch ? patch() : Promise.resolve({ ok: true, json: () => Promise.resolve(settings) }),
    ),
  );
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DispatchSettingsPanel />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const buttons = () => [...host.querySelectorAll("button")].map((b) => b.textContent?.trim());
const spinning = () =>
  [...host.querySelectorAll("button")].filter((b) => b.querySelector(".animate-spin")).map((b) => b.textContent?.trim());

describe("Settings → Dispatch", () => {
  it("a connected key shows only Disconnect", async () => {
    await render({ ...base, figmaConnected: true, anthropicConnected: true });
    expect(buttons()).not.toContain("Save token");
    expect(buttons()).not.toContain("Save key");
    expect(buttons().filter((b) => b === "Disconnect")).toHaveLength(2);
    expect(host.querySelector('input[placeholder="figd_…"]')).toBeNull();
    expect(host.querySelector('input[placeholder="sk-ant-admin…"]')).toBeNull();
  });

  it("not connected: the field and its Save, and no Disconnect", async () => {
    await render(base);
    expect(buttons()).toContain("Save token");
    expect(buttons()).toContain("Save key");
    expect(buttons()).not.toContain("Disconnect");
  });

  it("saving the Figma token spins only that button", async () => {
    let finish: (v: unknown) => void = () => undefined;
    await render(base, () => new Promise((r) => (finish = r)));

    const input = host.querySelector('input[placeholder="figd_…"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "figd_test_token_value");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.form!.requestSubmit();
    });

    expect(spinning()).toEqual(["Save token"]);
    await act(async () => finish({ ok: true, json: () => Promise.resolve({ ...base, figmaConnected: true }) }));
  });
});
