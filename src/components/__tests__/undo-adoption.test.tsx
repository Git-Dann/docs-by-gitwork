/**
 * Undo, where it is adopted, must run the EXACT inverse of what was done — not a nearby
 * operation that looks similar. Two places where that distinction is real:
 *
 *  - Requests: "Mark dealt with" → Undo puts back the status the request HAD. The Reopen
 *    button sets NEW, which would drop a PROMOTED/TRIAGED request's place.
 *  - Care: closing a conversation → Undo puts back new/open. A snoozed conversation gets no
 *    Undo, because setting SNOOZED back would leave `closedAt` stamped on a live thread.
 *
 * Driven through the real components and hooks, with `fetch` stubbed at the network edge.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WikiIntakeItemRecord } from "@/lib/api";
import type { Conversation } from "@/types/support";
import { ToastProvider } from "@/components/ui/toast";
import { WikiIntakeSection } from "@/components/clients/wiki/wiki-intake-section";
import { useCloseConversationWithUndo } from "@/hooks/use-support";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Call = { url: string; method: string; body: unknown };
let calls: Call[];
let root: Root | null;
let host: HTMLDivElement;

beforeEach(() => {
  calls = [];
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

function wrap(children: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

const undoButton = () =>
  [...document.body.querySelectorAll<HTMLButtonElement>("[data-undo-toast] button")].find((b) => b.textContent === "Undo");
const patches = () => calls.filter((c) => c.method === "PATCH");

function request(status: WikiIntakeItemRecord["status"]): WikiIntakeItemRecord {
  return {
    id: "req-1", type: "BUG", title: "Leaderboard defaults to NR", description: null, priority: "MEDIUM",
    status, requestedBy: null, externalRef: null, label: null, categoryId: null, categoryLabel: null,
    externalUrl: null, attachmentUrls: [], source: "wiki", taskId: status === "PROMOTED" ? "t1" : null,
    taskStatus: status === "PROMOTED" ? "TODO" : null, stage: status === "PROMOTED" ? "SCHEDULED" : "NEW",
    hasImage: false, imageFilename: null, device: null, osVersion: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), comments: [],
  };
}

describe("Requests: Mark dealt with → Undo", () => {
  it.each(["PROMOTED", "TRIAGED", "NEW"] as const)("restores %s, not NEW-by-default", async (status) => {
    act(() => root!.render(wrap(<WikiIntakeSection slug="acme" items={[request(status)]} mode="internal" />)));
    const close = host.querySelector<HTMLButtonElement>('button[aria-label="Mark Leaderboard defaults to NR dealt with"]')!;
    await act(async () => close.click());
    expect(patches().map((c) => c.body)).toEqual([{ status: "CLOSED" }]);
    expect(patches()[0].url).toBe("/api/clients/acme/wiki/intake-items/req-1");

    await act(async () => undoButton()!.click());
    expect(patches().map((c) => c.body)).toEqual([{ status: "CLOSED" }, { status }]);
  });

  it("a failed close offers no Undo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 500 })),
    );
    act(() => root!.render(wrap(<WikiIntakeSection slug="acme" items={[request("NEW")]} mode="internal" />)));
    const close = host.querySelector<HTMLButtonElement>('button[aria-label="Mark Leaderboard defaults to NR dealt with"]')!;
    await act(async () => close.click());
    expect(undoButton()).toBeUndefined();
  });
});

describe("Care: close → Undo", () => {
  let closeIt: (c: Conversation) => void;
  function Harness() {
    closeIt = useCloseConversationWithUndo("client-1");
    return null;
  }
  const conv = (status: Conversation["status"]) =>
    ({ id: "conv-1", status, subject: "Can't log in", customerLabel: "sam@example.com" }) as Conversation;

  it.each(["new", "open"] as const)("restores %s through triage", async (status) => {
    act(() => root!.render(wrap(<Harness />)));
    await act(async () => closeIt(conv(status)));
    expect(calls.map((c) => [c.method, c.url, c.body])).toContainEqual([
      "POST",
      "/api/support/clients/client-1/conversations/conv-1/close",
      {},
    ]);
    await act(async () => undoButton()!.click());
    expect(calls.find((c) => c.url.endsWith("/triage"))).toMatchObject({ method: "PATCH", body: { status } });
  });

  it("a snoozed conversation is closed without an Undo", async () => {
    act(() => root!.render(wrap(<Harness />)));
    await act(async () => closeIt(conv("snoozed")));
    expect(calls.some((c) => c.url.endsWith("/close"))).toBe(true);
    expect(undoButton()).toBeUndefined();
  });

  it("an already-closed conversation is left alone", async () => {
    act(() => root!.render(wrap(<Harness />)));
    await act(async () => closeIt(conv("closed")));
    expect(calls).toHaveLength(0);
  });
});
