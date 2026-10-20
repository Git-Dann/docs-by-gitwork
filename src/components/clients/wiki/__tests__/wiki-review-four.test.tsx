// @vitest-environment jsdom
/**
 * The October 2026 wiki review: one Docs row + tabs, what the client can't see marked EMPTY,
 * and the phone section picker. Built on the real demo wiki, not a hand-made partial DTO — a
 * cast fixture is how a missing field hides (§49.2).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDemoApi } from "@/lib/demo/dev-demo-data";
import type { WikiDTO } from "@/lib/api";
import { clientVisibleSections } from "@/lib/wiki-client-visibility";
import { WikiMobileNav } from "@/components/clients/wiki/wiki-mobile-nav";
import { WikiDocTabs } from "@/components/clients/wiki/wiki-doc-tabs";
import type { WikiSection } from "@/components/clients/wiki/wiki-sidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const demo = () => structuredClone(resolveDemoApi("/api/clients/northwind/wiki") as WikiDTO);
const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

let root: ReturnType<typeof createRoot> | null = null;
function mount(el: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("what the client can see", () => {
  it("an enabled section with nothing in it is left off the client's link", () => {
    const w = demo();
    expect(clientVisibleSections(w)).toContain("costs");
    w.costs = { ...w.costs, items: [] };
    expect(clientVisibleSections(w)).not.toContain("costs");
  });

  it("Dashboard is always there, and an empty timeline is not", () => {
    const w = demo();
    w.timeline = { ...w.timeline, blocks: [], milestones: [] };
    const seen = clientVisibleSections(w);
    expect(seen[0]).toBe("dashboard");
    expect(seen).not.toContain("timeline");
  });

  it("⚠️ the internal wiki marks EMPTY from the SAME rule the share page uses", () => {
    const ws = src("components/clients/wiki/wiki-workspace.tsx");
    expect(ws).toContain("new Set(clientVisibleSections(wiki))");
    expect(ws).toContain("emptySections={emptySections}");
    expect(src("components/clients/wiki/wiki-public-view.tsx")).toContain("clientVisibleSections(wiki)");
  });

  it("an EMPTY section never wears the 'shared' globe — the link doesn't show it", () => {
    expect(src("components/clients/wiki/wiki-sidebar.tsx")).toContain("const isShared = shared.has(section) && !isEmpty;");
  });
});

const TITLES = new Proxy({}, { get: (_t, k) => String(k).toUpperCase() }) as Record<WikiSection, string>;

describe("doc pages: one Docs entry, tabs between them", () => {
  it("tabs render only when there is more than one page", () => {
    let host = mount(<WikiDocTabs sections={["runbook"]} active="runbook" titles={TITLES} onSelect={() => {}} />);
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    act(() => root?.unmount());
    host = mount(
      <WikiDocTabs sections={["ia", "runbook", "data-model"]} active="runbook" titles={TITLES} onSelect={() => {}} />,
    );
    const tabs = [...host.querySelectorAll('[role="tab"]')];
    expect(tabs).toHaveLength(3);
    expect(tabs.find((t) => t.getAttribute("aria-selected") === "true")?.textContent).toBe("RUNBOOK");
  });

  it("the phone picker lists the doc pages ONCE, as Docs, and opens the one you're on", () => {
    let picked: WikiSection | null = null;
    const host = mount(
      <WikiMobileNav
        sections={["dashboard", "timeline", "ia", "runbook", "architecture"]}
        active="runbook"
        titles={TITLES}
        onSelect={(s) => (picked = s)}
      />,
    );
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    const items = [...host.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(items).toEqual(["DASHBOARD", "TIMELINE", "Docs"]);
    act(() => ([...host.querySelectorAll('[role="menuitem"]')].at(-1) as HTMLButtonElement).click());
    expect(picked).toBe("runbook");
  });
});

describe("the phone picker", () => {
  const long: WikiSection[] = ["dashboard", "timeline", "delivery", "intake", "launchpad", "metrics", "sheets", "platforms", "changelog", "settings"];

  it("groups a long list under the sidebar's headings, Dashboard first and Settings last", () => {
    const host = mount(<WikiMobileNav sections={long} active="dashboard" titles={TITLES} onSelect={() => {}} />);
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    const text = host.querySelector('[role="menu"]')!.textContent!;
    for (const h of ["Overview", "Working together", "Numbers", "Product"]) expect(text).toContain(h);
    const items = [...host.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(items[0]).toBe("DASHBOARD");
    expect(items.at(-1)).toBe("SETTINGS");
  });

  it("orders each group the way the desktop sidebar does, whatever order sections arrive in", () => {
    const host = mount(
      <WikiMobileNav sections={["dashboard", "roundup", "meetings", "timeline", "delivery", "intake", "metrics", "platforms"]} active="dashboard" titles={TITLES} onSelect={() => {}} />,
    );
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    const items = [...host.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(items.slice(1, 5)).toEqual(["TIMELINE", "DELIVERY", "ROUNDUP", "MEETINGS"]);
  });

  it("a short list stays flat", () => {
    const host = mount(<WikiMobileNav sections={["dashboard", "timeline", "intake"]} active="dashboard" titles={TITLES} onSelect={() => {}} />);
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    expect(host.querySelector('[role="menu"]')!.textContent).not.toContain("Overview");
  });

  it("marks EMPTY sections, and offers Add New on the internal wiki", () => {
    let added: WikiSection | null = null;
    const host = mount(
      <WikiMobileNav
        sections={long}
        active="dashboard"
        titles={TITLES}
        onSelect={() => {}}
        emptySections={["sheets"]}
        addable={[{ section: "runbook", label: "Runbook" }]}
        onAdd={(s) => (added = s)}
      />,
    );
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    const sheets = [...host.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.startsWith("SHEETS"));
    expect(sheets?.textContent).toContain("EMPTY");
    const add = [...host.querySelectorAll("button")].find((b) => b.textContent === "Add New") as HTMLButtonElement;
    act(() => add.click());
    act(() => ([...host.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.startsWith("Runbook")) as HTMLButtonElement).click());
    expect(added).toBe("runbook");
  });
});

describe("numbering", () => {
  it("Design System's first card is 01, and its sections follow from 02", () => {
    const ds = src("components/clients/design-system/design-system-viewer.tsx");
    expect(ds).not.toContain('label--number">00<');
    expect(ds).toContain("n={i + 2}");
  });

  it("Requests: the Action needed card is 01 and the Requests cards follow on", () => {
    expect(src("components/clients/wiki/wiki-blockers-section.tsx")).toContain('" // ACTION NEEDED"');
    for (const f of ["components/clients/wiki/wiki-workspace.tsx", "components/clients/wiki/wiki-public-view.tsx"]) {
      expect(src(f), f).toMatch(/firstNumber=\{wiki!?\.blockers\.length > 0 \? 2 : 1\}/);
    }
  });
});
