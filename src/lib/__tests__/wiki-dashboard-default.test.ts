import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_LAYOUT,
  effectiveLayout,
  readDefaultLayout,
  resolveLayout,
  scopeDefaultLayout,
  type DashboardLayout,
} from "@/lib/wiki-dashboard-layout";

const teamDefault: DashboardLayout = {
  order: ["board", "costs", "standups"],
  sizes: { board: 3, costs: 2 },
  hidden: ["monitors"],
};

describe("the client's default dashboard (Decision E)", () => {
  it("a person's own layout wins, then the client's default, then the code's", () => {
    const mine: DashboardLayout = { order: ["costs"], sizes: {}, hidden: [] };
    expect(effectiveLayout(mine, teamDefault)).toBe(mine);
    expect(effectiveLayout(null, teamDefault)).toBe(teamDefault);
    expect(effectiveLayout(null, null)).toBe(EMPTY_LAYOUT);
  });

  it("an empty or malformed stored default reads as none", () => {
    expect(readDefaultLayout(null)).toBeNull();
    expect(readDefaultLayout("nope")).toBeNull();
    expect(readDefaultLayout({ order: [], sizes: {}, hidden: [] })).toBeNull();
    expect(readDefaultLayout(teamDefault)).toEqual(teamDefault);
  });

  it("the client's copy names only cards the client has", () => {
    const scoped = scopeDefaultLayout(teamDefault, ["standups", "board"])!;
    expect(scoped.order).toEqual(["board", "standups"]);
    expect(Object.keys(scoped.sizes)).toEqual(["board"]);
    expect(scoped.hidden).toEqual([]);
    expect(JSON.stringify(scoped)).not.toMatch(/costs|monitors/);
    expect(scopeDefaultLayout(teamDefault, [])).toBeNull();
  });

  it("a default can only arrange cards the viewer has, never add one", () => {
    const resolved = resolveLayout(teamDefault, ["board", "standups"]);
    expect(resolved.visible.map((c) => c.id)).toEqual(["board", "standups"]);
  });
});

describe("wiring", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("the client's copy scopes the default to the sections it shows", () => {
    const src = read("src/server/wiki.ts");
    const pub = src.slice(src.indexOf("function forPublic("), src.indexOf("export async function setWikiDashboardLayout"));
    expect(pub).toContain("scopeDefaultLayout(trimmed.dashboardLayout, [STANDUPS_CARD, ...visibleSections])");
  });

  it("only the team can set it: Manage clients and access to this client, and no token route", () => {
    const src = read("src/app/api/clients/[slug]/wiki/dashboard-layout/route.ts");
    expect(src).toContain("resolveInternalSheets(req, slug");
    expect(src.indexOf("resolveInternalSheets(")).toBeLessThan(src.indexOf("setWikiDashboardLayout(clientId"));
    expect(() => read("src/app/api/wiki/[token]/dashboard-layout/route.ts")).toThrow();
  });
});
