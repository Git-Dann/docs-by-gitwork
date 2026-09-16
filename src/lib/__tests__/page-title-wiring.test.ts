import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The client-scoped pages name their feature TWICE — once in generateMetadata (so
 * the tab is right on first paint) and once as AppShell's `title` (which the
 * client-side sync reads). Two sources for one string is a drift risk I
 * introduced knowingly; this is the guard that makes it safe.
 *
 * If they diverge the symptom is nasty and quiet: the tab renders one title from
 * the server, then silently changes to a different one a tick later on hydration.
 */

const ROOT = join(__dirname, "..", "..", "..");
const PAGES = [
  "src/app/(app)/app/portal/[slug]/tasks/page.tsx",
  "src/app/(app)/app/portal/[slug]/page.tsx",
  "src/app/(app)/app/portal/[slug]/design-system/page.tsx",
  "src/app/(app)/app/projects/[slug]/page.tsx",
];

describe("client-scoped page titles", () => {
  it.each(PAGES)("%s names the same feature server-side and in AppShell", (rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const meta = src.match(/pageMetadataTitle\(\s*"([^"]+)"/);
    const shell = src.match(/<AppShell[\s\S]{0,200}?title="([^"]+)"/);
    expect(meta, `${rel}: no pageMetadataTitle call`).toBeTruthy();
    expect(shell, `${rel}: no AppShell title`).toBeTruthy();
    expect(
      meta![1],
      `${rel}: generateMetadata says "${meta![1]}" but AppShell says "${shell![1]}" — the tab ` +
        `would change on hydration.`,
    ).toBe(shell![1]);
  });

  it.each(PAGES)("%s passes the client name into AppShell", (rel) => {
    // Without this the client-side sync overwrites the server's title with a
    // context-less one, undoing the whole point.
    const src = readFileSync(join(ROOT, rel), "utf8");
    expect(src).toContain("titleContext=");
    expect(src).toContain("getClientNameBySlug");
  });

  it("the legacy /app/clients/[slug] redirect stub does NOT query for a title", () => {
    // It redirects; a title would never render, and the lookup would be a wasted
    // query on every hit of an old bookmark.
    const src = readFileSync(join(ROOT, "src/app/(app)/app/clients/[slug]/page.tsx"), "utf8");
    expect(src).not.toContain("generateMetadata");
  });
});
