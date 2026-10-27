// @vitest-environment jsdom
/**
 * Pulse's nav. Three things worth pinning:
 *  1. every link goes to a page that exists, in the app AND the demo (a nav item with no
 *     page is a 404 one click from the module's front door);
 *  2. the internal-only items (Monitors, Growth) are hidden from a guest and while the
 *     account loads — and, because hiding a link is not access control, their routes are
 *     internal-only in the module gate too;
 *  3. the current page is worked out from the pathname, including pages that belong to an
 *     item without being its path (a project's history → Projects, embed → Growth).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  PULSE_APP_BASE,
  PULSE_DEMO_BASE,
  PULSE_NAV_ITEMS,
  activePulseNavId,
  pulseNavHref,
  visiblePulseNavItems,
} from "@/lib/pulse-nav";
import { INTERNAL_ONLY_PREFIXES, hasModuleAccess, matchesPrefix } from "@/server/auth/module-gate";

const account = { isPending: false, data: { role: "DEVELOPER" } as { role: string } | undefined };
let pathname = "/app/pulse";
let canGenerateAi = true;

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/hooks/use-account", () => ({ useAccount: () => account }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ canGenerateAi }) }));

import { PulseNav } from "../pulse-nav";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = join(__dirname, "../../../..");
function pageExists(dir: string, href: string, base: string): boolean {
  return existsSync(join(ROOT, dir, href.slice(base.length), "page.tsx"));
}

function labels(html: string): string[] {
  return [...html.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
}

beforeEach(() => {
  account.isPending = false;
  account.data = { role: "DEVELOPER" };
  pathname = "/app/pulse";
  canGenerateAi = true;
});

describe("Pulse nav routes", () => {
  it.each(PULSE_NAV_ITEMS.map((i) => [i.id, i] as const))("%s has an app page and a demo page", (_id, item) => {
    expect(pageExists("src/app/(app)/app/pulse", pulseNavHref(PULSE_APP_BASE, item), PULSE_APP_BASE)).toBe(true);
    expect(pageExists("src/app/demo/pulse", pulseNavHref(PULSE_DEMO_BASE, item), PULSE_DEMO_BASE)).toBe(true);
  });

  it("gates every internal item at the route, and leaves the others to the pulse module", () => {
    for (const item of PULSE_NAV_ITEMS) {
      const href = pulseNavHref(PULSE_APP_BASE, item);
      const gated = INTERNAL_ONLY_PREFIXES.some((p) => matchesPrefix(href, p));
      expect(gated, href).toBe(item.internal);
      // A guest holding the Pulse module reaches exactly the non-internal items.
      expect(hasModuleAccess(href, ["pulse"], "GUEST"), href).toBe(!item.internal);
      expect(hasModuleAccess(href, ["pulse"], "DEVELOPER"), href).toBe(true);
    }
  });

  it("hides the internal items from a non-internal viewer", () => {
    expect(visiblePulseNavItems({ internal: false }).map((i) => i.id)).toEqual(["projects", "portfolio", "compare"]);
    expect(visiblePulseNavItems({ internal: true }).map((i) => i.id)).toEqual([
      "projects", "monitors", "portfolio", "compare", "growth",
    ]);
  });
});

describe("activePulseNavId", () => {
  it.each([
    ["/app/pulse", "projects"],
    ["/app/pulse/", "projects"],
    ["/app/pulse/projects/url%3Aexample", "projects"],
    ["/app/pulse/new", "projects"],
    ["/app/pulse/monitors", "monitors"],
    ["/app/pulse/portfolio", "portfolio"],
    ["/app/pulse/compare?from=a&to=b", "compare"],
    ["/app/pulse/growth", "growth"],
    ["/app/pulse/embed", "growth"],
    ["/app/pulse/scan-123", null],
    ["/app/pulsex", null],
    ["/app/care", null],
  ] as const)("%s → %s", (path, id) => {
    expect(activePulseNavId(path, PULSE_APP_BASE)).toBe(id);
  });

  it("works on the demo base", () => {
    expect(activePulseNavId("/demo/pulse/portfolio", PULSE_DEMO_BASE)).toBe("portfolio");
    expect(activePulseNavId("/demo/pulse", PULSE_DEMO_BASE)).toBe("projects");
  });
});

describe("<PulseNav>", () => {
  const render = (props: React.ComponentProps<typeof PulseNav> = {}) => {
    let html = "";
    act(() => {
      html = renderToStaticMarkup(<PulseNav {...props} />);
    });
    return html;
  };

  it("shows every item to a colleague and marks the current page", () => {
    pathname = "/app/pulse/embed";
    const html = render();
    expect(labels(html)).toEqual(["Projects", "Monitors", "Portfolio", "Compare", "Growth", "New scan"]);
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/app\/pulse\/growth"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("hides Monitors and Growth from a guest", () => {
    account.data = { role: "GUEST" };
    expect(labels(render())).toEqual(["Projects", "Portfolio", "Compare", "New scan"]);
  });

  it("hides them while the account is still loading", () => {
    account.isPending = true;
    account.data = undefined;
    expect(labels(render())).not.toContain("Growth");
    expect(labels(render())).not.toContain("Monitors");
  });

  it("offers New scan only to someone who may run one, and never in the demo", () => {
    canGenerateAi = false;
    expect(labels(render())).not.toContain("New scan");
    canGenerateAi = true;
    const demo = render({ base: PULSE_DEMO_BASE, newScanHref: null });
    expect(labels(demo)).not.toContain("New scan");
    expect(demo).toContain('href="/demo/pulse/portfolio"');
    expect(demo).not.toContain('href="/app/');
  });
});
