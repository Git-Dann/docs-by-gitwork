/**
 * The wiki sidebar's grouping. The sidebar file and the group map are two lists of the same
 * sections; these tests are what keeps them saying the same thing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GROUP_HEADINGS_ABOVE,
  SECTION_BLURB,
  SECTION_GROUP,
  WIKI_SECTION_GROUPS,
  DOC_PAGE_SECTIONS,
  groupAddable,
  isDocPageSection,
} from "@/lib/wiki-section-groups";

const sidebar = readFileSync(join(process.cwd(), "src/components/clients/wiki/wiki-sidebar.tsx"), "utf8");

/** Every id in the sidebar's `WikiSection` union. */
const unionIds = [...sidebar.slice(sidebar.indexOf("export type WikiSection ="), sidebar.indexOf(";", sidebar.indexOf("export type WikiSection ="))).matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);

/** The ids whose `navItem(...)` sits inside the sidebar's `group("<id>", [...])` call. */
function idsInGroup(id: string): string[] {
  const start = sidebar.indexOf(`{group("${id}", [`);
  if (start < 0) return [];
  const end = sidebar.indexOf("])}", start);
  return [...sidebar.slice(start, end).matchAll(/navItem\("([a-z-]+)"/g)].map((m) => m[1]);
}

describe("every section has exactly one home", () => {
  it("found the sections at all (a broken matcher would pass everything below)", () => {
    expect(unionIds.length).toBeGreaterThan(20);
  });

  it("⚠️ every section except Dashboard and Settings is filed in a group", () => {
    const missing = unionIds.filter((id) => id !== "dashboard" && id !== "settings" && !(id in SECTION_GROUP));
    expect(missing).toEqual([]);
  });

  it("the sidebar renders each section inside the group the map says — so Add New and the sidebar agree", () => {
    for (const g of WIKI_SECTION_GROUPS) {
      // The six doc pages are ONE "Docs" row (docsRow), not six navItems.
      const expected = Object.entries(SECTION_GROUP)
        .filter(([k, v]) => v === g.id && !isDocPageSection(k))
        .map(([k]) => k)
        .sort();
      expect(idsInGroup(g.id).sort(), g.id).toEqual(expected);
    }
  });

  it("the six doc pages are filed under Docs & handover, and rendered as the one Docs row there", () => {
    for (const d of DOC_PAGE_SECTIONS) expect(SECTION_GROUP[d], d).toBe("docs");
    const start = sidebar.indexOf(`{group("docs", [`);
    expect(sidebar.slice(start, sidebar.indexOf("])}", start))).toContain("docsRow()");
  });

  it("Dashboard and Settings stay outside every group", () => {
    for (const g of WIKI_SECTION_GROUPS) {
      expect(idsInGroup(g.id)).not.toContain("dashboard");
      expect(idsInGroup(g.id)).not.toContain("settings");
    }
  });

  it("every grouped section has a one-line description for Add New", () => {
    for (const id of Object.keys(SECTION_GROUP)) {
      expect(SECTION_BLURB[id as keyof typeof SECTION_BLURB], id).toBeTruthy();
    }
  });
});

describe("Add New, grouped", () => {
  it("keeps sidebar group order, drops empty groups, and never loses an unknown section", () => {
    const out = groupAddable([
      { section: "api-docs", label: "API Docs" },
      { section: "monitors", label: "Monitors" },
      { section: "intake", label: "Requests" },
      { section: "something-new", label: "New thing" },
    ]);
    expect(out.map((g) => `${g.label ?? "—"}:${g.items.map((i) => i.section).join(",")}`)).toEqual([
      "Working together:intake",
      "Product:monitors",
      "Docs & handover:api-docs",
      "—:something-new",
    ]);
  });
});

describe("headings only on a long list", () => {
  it("a short wiki stays flat", () => {
    // Most clients show 2–6 sections (measured Oct 2026); Wedge shows 13.
    expect(GROUP_HEADINGS_ABOVE).toBe(6);
    expect(sidebar).toContain("const grouped = navCount > GROUP_HEADINGS_ABOVE;");
  });
});
