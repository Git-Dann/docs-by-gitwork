/**
 * Pulse's own navigation: which pages it has, which ones a viewer may see, and which one
 * they are on. Pure, so the in-app nav and the /demo nav cannot disagree, and so a test can
 * check every item against a real route and the module gate without rendering anything.
 *
 * ⚠️ `internal` items are about GITWORK, not the signed-in person (our monitors, our own
 * marketing pages, captured leads). They are hidden from an external role here AND their
 * routes are in `INTERNAL_ONLY_PREFIXES` (src/server/auth/module-gate.ts), because hiding a
 * link is not access control. Add a page here and it needs one of those decisions too.
 */

export type PulseNavId = "projects" | "monitors" | "portfolio" | "compare" | "growth";

export interface PulseNavItem {
  id: PulseNavId;
  label: string;
  /** Path under the base, "" for the base itself. */
  path: string;
  /** Hidden from external roles (guests); the route is internal-only in the module gate. */
  internal: boolean;
}

export const PULSE_NAV_ITEMS: readonly PulseNavItem[] = [
  { id: "projects", label: "Projects", path: "", internal: false },
  { id: "monitors", label: "Monitors", path: "/monitors", internal: true },
  { id: "portfolio", label: "Portfolio", path: "/portfolio", internal: false },
  { id: "compare", label: "Compare", path: "/compare", internal: false },
  { id: "growth", label: "Growth", path: "/growth", internal: true },
];

export const PULSE_APP_BASE = "/app/pulse";
export const PULSE_DEMO_BASE = "/demo/pulse";

/**
 * Pages that belong to a nav item without being its own path. A project's history is part
 * of Projects (as is New scan); the public-embed settings are part of Growth.
 */
const OWNED_PATHS: ReadonlyArray<{ path: string; id: PulseNavId }> = [
  { path: "/projects", id: "projects" },
  { path: "/new", id: "projects" },
  { path: "/embed", id: "growth" },
];

/** The items a viewer may see. `internal` false hides the internal-only ones. */
export function visiblePulseNavItems(opts: { internal: boolean }): PulseNavItem[] {
  return PULSE_NAV_ITEMS.filter((item) => opts.internal || !item.internal);
}

export function pulseNavHref(base: string, item: Pick<PulseNavItem, "path">): string {
  return `${base}${item.path}`;
}

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * The item the viewer is on, or null when the page is not part of the nav (a scan's own
 * report at `<base>/<scanId>`).
 */
export function activePulseNavId(pathname: string | null | undefined, base: string): PulseNavId | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "");
  if (path === base) return "projects";
  if (!under(path, base)) return null;
  const rest = path.slice(base.length);
  for (const item of PULSE_NAV_ITEMS) {
    if (item.path && under(rest, item.path)) return item.id;
  }
  for (const owned of OWNED_PATHS) {
    if (under(rest, owned.path)) return owned.id;
  }
  return null;
}
