// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiOk } from "@/lib/api-response";
import { LabsPanel } from "@/components/settings/labs-panel";

/**
 * The Block gallery button, driven end to end against the REAL response envelope.
 *
 * It shipped broken: the handler read `body.data.href`, but `apiOk(data)` returns the payload
 * UNWRAPPED — there is no `{ data: … }` wrapper. So every click built the document server-side and
 * then died on "Cannot read properties of undefined (reading 'href')", leaving a red error under a
 * button that had in fact just done its job.
 *
 * Nothing caught it because the route was tested, the fixture was tested, and the six lines
 * joining them were only ever read. So the response below is built by `apiOk` itself rather than
 * hand-written — a hand-written fixture would just re-encode whatever shape I happened to assume,
 * which is the mistake, not the test.
 */

let host: HTMLDivElement;
let navigatedTo: string | null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);

  // jsdom won't navigate, so capture the assignment instead — that IS the observable outcome.
  navigatedTo = null;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return navigatedTo ?? "http://localhost/";
      },
      set href(next: string) {
        navigatedTo = next;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The exact bytes the route sends on success, produced by the real helper. */
async function realSuccessBody() {
  const response = apiOk(
    { proposal: { id: "doc_1" }, blockCount: 38, href: "/app/docs/doc_1" },
    { status: 201 },
  );
  return response.json();
}

function render() {
  const root = createRoot(host);
  // BadgeStudio (a sibling entry) reads through React Query, so the panel needs a client even
  // though the gallery button itself is a plain fetch.
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <LabsPanel />
      </QueryClientProvider>,
    ),
  );
}

function clickCreate() {
  const card = Array.from(host.querySelectorAll("li")).find((li) =>
    li.textContent?.includes("Block gallery"),
  );
  if (!card) throw new Error("No Block gallery entry in Labs");

  const button = card.querySelector("button");
  if (!button) throw new Error("Block gallery entry has no button");
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Labs → Block gallery", () => {
  it("opens the document the server created", async () => {
    const body = await realSuccessBody();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => body })),
    );

    render();
    clickCreate();
    await settle();

    expect(navigatedTo, "should navigate to the new document").toBe("/app/docs/doc_1");
    expect(host.textContent).not.toContain("Cannot read properties");
  });

  it("posts to the seed route", async () => {
    const body = await realSuccessBody();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }));
    vi.stubGlobal("fetch", fetchMock);

    render();
    clickCreate();
    await settle();

    expect(fetchMock).toHaveBeenCalledWith("/api/dev/seed-block-gallery", { method: "POST" });
  });

  it("shows the server's reason when the request fails, and does not navigate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "Super Admin only." }) })),
    );

    render();
    clickCreate();
    await settle();

    expect(host.textContent).toContain("Super Admin only.");
    expect(navigatedTo).toBeNull();
  });

  it("says so rather than throwing if the payload carries no link", async () => {
    // Defensive, but the failure mode it replaces is the one that shipped: an unreadable
    // TypeError surfaced to the operator as if the whole thing had failed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ blockCount: 38 }) })),
    );

    render();
    clickCreate();
    await settle();

    expect(host.textContent).toContain("no link");
    expect(host.textContent).not.toContain("Cannot read properties");
    expect(navigatedTo).toBeNull();
  });
});
