/**
 * The lead Activity card is paged, ten at a time. A synced lead logs every email and Slack
 * message, so the open-ended list it replaced ran to hundreds of rows ("the list is insane").
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ClientTouchpoint } from "@/types/client";

vi.mock("@/hooks/use-proposals", () => ({
  useAddClientTouchpoint: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateClient: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

function tp(i: number, source: ClientTouchpoint["source"]): ClientTouchpoint {
  return {
    id: `t${i}`,
    type: source === "slack" ? "SLACK" : "EMAIL",
    note: `entry ${i}`,
    occurredAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 0) - i * 3_600_000).toISOString(),
    authorId: null,
    authorName: null,
    createdAt: new Date().toISOString(),
    source,
    direction: source === "gmail" ? "inbound" : "internal",
    counterpartName: null,
    counterpartEmail: null,
  };
}

// 23 entries: 18 emails then 5 Slack messages.
const touchpoints = [
  ...Array.from({ length: 18 }, (_, i) => tp(i, "gmail")),
  ...Array.from({ length: 5 }, (_, i) => tp(18 + i, "slack")),
];

let root: Root | null = null;
let host: HTMLElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function mount() {
  const { ActivityCard } = await import("@/components/clients/lead-crm");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<ActivityCard slug="valu" touchpoints={touchpoints} canManage={false} />));
}

const rows = () => [...host.querySelectorAll("ul > li")].map((li) => li.textContent ?? "");
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label))!;

describe("lead Activity pagination", () => {
  it("shows ten entries and says where you are", async () => {
    await mount();
    expect(rows()).toHaveLength(10);
    expect(host.textContent).toContain("PAGE 1 OF 3");
    expect(button("Previous").disabled).toBe(true);
  });

  it("pages forward to the next ten, and the last page holds the remainder", async () => {
    await mount();
    act(() => button("Next").click());
    expect(host.textContent).toContain("PAGE 2 OF 3");
    expect(rows()[0]).toContain("entry 10");
    act(() => button("Next").click());
    expect(rows()).toHaveLength(3);
    expect(button("Next").disabled).toBe(true);
  });

  it("goes back to page 1 when the filter changes", async () => {
    await mount();
    act(() => button("Next").click());
    expect(host.textContent).toContain("PAGE 2 OF 3");
    // Email has 18 entries — two pages — so a missing reset would leave you on page 2.
    act(() => button("Email").click());
    expect(host.textContent).toContain("PAGE 1 OF 2");
    expect(rows()[0]).toContain("entry 0");
  });

  it("hides the pager when everything fits on one page", async () => {
    await mount();
    act(() => button("Slack").click());
    expect(rows()).toHaveLength(5);
    expect(host.textContent).not.toContain("PAGE");
  });
});
