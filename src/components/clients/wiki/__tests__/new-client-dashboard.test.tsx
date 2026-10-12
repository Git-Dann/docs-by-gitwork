// @vitest-environment jsdom
/**
 * A brand-new client — a wiki with nothing in it yet — must open on an overview
 * that reads as "nothing yet", not as a broken page.
 *
 * Built by emptying the real demo wiki rather than hand-writing a fixture, so a
 * field added to `WikiDTO` later is covered automatically: every list goes to
 * `[]`, and the sections a new client cannot have yet are switched off.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDemoApi } from "@/lib/demo/dev-demo-data";
import type { WikiDTO } from "@/server/wiki";
import { WikiDashboard } from "@/components/clients/wiki/wiki-dashboard";
import { WikiStandupsCard } from "@/components/clients/wiki/wiki-standups-card";
import type { WikiSection } from "@/components/clients/wiki/wiki-sidebar";

// Every section switched on. An enabled-but-empty section is the risky case —
// e.g. Delivery turned on before a plan exists is exactly where `null%` came from.
const EVERY_SECTION: WikiSection[] = [
  "dashboard", "timeline", "monitors", "documents", "intake", "launchpad", "insights",
  "costs", "roundup", "delivery", "support", "code-handover", "design-system", "ia",
  "dev-guide", "api-docs", "architecture", "runbook", "data-model", "changelog",
  "course-requests", "golf-data",
];

function emptied<T>(v: T): T {
  if (Array.isArray(v)) return [] as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = emptied(x);
    return out as T;
  }
  return v;
}

function newClientWiki(): WikiDTO {
  const demo = resolveDemoApi("/api/clients/northwind/wiki") as WikiDTO;
  const w = emptied(demo);
  return {
    ...w,
    support: { ...w.support, enabled: false, linked: false, current: null, previous: null },
  } as WikiDTO;
}

let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  document.body.innerHTML = "";
});

function render(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  act(() => {
    createRoot(host).render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  });
  return host.textContent ?? "";
}

describe("a brand-new client's overview", () => {
  it("renders with no NaN, null, undefined or Infinity anywhere", () => {
    const text = render(
      <WikiDashboard wiki={newClientWiki()} availableSections={EVERY_SECTION} onSelect={() => {}} />,
    );
    // Guard against a render that silently drew nothing: the section cards are there.
    expect(text).toMatch(/Delivery/);
    expect(text).toMatch(/Timeline/);
    // ⚠️ Per text node, not over `textContent`: adjacent nodes run together
    // ("TimelineNaN%"), so a word-boundary match on the whole string never fires.
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const bad: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue ?? "";
      if (/NaN|undefined|Infinity|\bnull\b/.test(v)) bad.push(v);
    }
    expect(bad).toEqual([]);
  });

  it("still closes on the footer, with no zeroed facts", () => {
    const text = render(
      <WikiDashboard wiki={newClientWiki()} availableSections={EVERY_SECTION} onSelect={() => {}} />,
    );
    expect(text).toMatch(/Built and maintained by Gitwork/);
    expect(text).not.toMatch(/Last updated|Resources?\d|Systems/);
  });

  it("tells a new client daily updates are coming, without a '0 TODAY' count", () => {
    const text = render(
      <WikiStandupsCard
        standups={{ today: { workDate: "2026-10-12T00:00:00.000Z", devs: [] }, history: [] }}
        roundup={null}
        numeral="i"
      />,
    );
    expect(text).toMatch(/Daily updates will appear here once work starts/);
    expect(text).not.toMatch(/0 TODAY/);
    expect(text).not.toMatch(/No updates pushed yet today/);
  });

  it("points a quiet morning at the last day there was an update", () => {
    const text = render(
      <WikiStandupsCard
        standups={{
          today: { workDate: "2026-10-12T00:00:00.000Z", devs: [] },
          history: [
            {
              workDate: "2026-10-09T00:00:00.000Z",
              devs: [
                {
                  userId: "u",
                  name: "Priya Shah",
                  amPushedAt: "2026-10-09T09:00:00.000Z",
                  pmPushedAt: null,
                  inProgress: [{ id: "t", title: "Search" }],
                  inReview: [],
                  doneToday: [],
                  source: "reported",
                },
              ],
            },
          ],
        }}
        roundup={null}
        numeral="i"
      />,
    );
    expect(text).toMatch(/No updates pushed yet today\. See Fri 9 Oct/);
    expect(text).toMatch(/0 TODAY/);
  });
});
