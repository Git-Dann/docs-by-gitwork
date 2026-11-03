import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/effective-user", () => ({
  ForbiddenError: class extends Error {},
  requireAuthedUser: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import {
  PlatformConflictError,
  PlatformInputError,
  applyPlatformQuery,
  parsePlatformAuditQuery,
  parsePlatformWorkspaceQuery,
  planWorkspaceUpdate,
  platformQueryString,
} from "@/lib/platform-rules";
import type { PlatformWorkspace } from "@/lib/platform-types";
import { platformWorkspaceWhere } from "@/server/platform/workspaces";
import { draftProblem } from "@/components/platform/platform-console";
import { resolveDemoPlatform } from "@/lib/demo/demo-platform";

const q = (s = "") => parsePlatformWorkspaceQuery(new URLSearchParams(s));

const ws = (i: number, over: Partial<PlatformWorkspace> = {}): PlatformWorkspace => ({
  id: `ws-${String(i).padStart(2, "0")}`,
  name: `Business ${String(i).padStart(2, "0")}`,
  slug: `business-${i}`,
  createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 5, 1)).toISOString(),
  isHome: false,
  activeMembers: i,
  modulesRestricted: i % 2 === 0,
  enabledModules: i % 2 === 0 ? ["clients"] : [],
  platformAiKeysAllowed: i % 3 === 0,
  ...over,
});
const many = Array.from({ length: 45 }, (_, i) => ws(i + 1));

describe("parsePlatformWorkspaceQuery", () => {
  it("defaults to newest first, 20 a page", () => {
    expect(q()).toMatchObject({ page: 0, pageSize: 20, sort: "created", dir: "desc", modules: "any", ai: "any" });
    expect(q("sort=name").dir).toBe("asc");
  });

  it("refuses bad values with a sentence naming them, never a silent default", () => {
    expect(() => q("sort=revenue")).toThrow(/sort must be one of/);
    expect(() => q("pageSize=51")).toThrow(/pageSize must be between 1 and 50/);
    expect(() => q("pageSize=0")).toThrow(PlatformInputError);
    expect(() => q("page=two")).toThrow(/page must be a whole number/);
    expect(() => q("page=-1")).toThrow(PlatformInputError);
    expect(() => q("dir=up")).toThrow(/dir/);
    expect(() => q("modules=some")).toThrow(/modules/);
    expect(() => q(`q=${"x".repeat(101)}`)).toThrow(/100 characters/);
  });

  it("round-trips through the query string", () => {
    const query = q("q=north&page=2&sort=members&dir=asc&modules=chosen&ai=own");
    expect(q(platformQueryString(query))).toEqual(query);
  });
});

describe("applyPlatformQuery", () => {
  it("pages without overlap and reports the total", () => {
    const p0 = applyPlatformQuery(many, q());
    const p2 = applyPlatformQuery(many, q("page=2"));
    expect(p0.total).toBe(45);
    expect(p0.workspaces).toHaveLength(20);
    expect(p2.workspaces).toHaveLength(5);
    expect(new Set([...p0.workspaces, ...p2.workspaces].map((w) => w.id)).size).toBe(25);
  });

  it("clamps a page past the end to the last page, so a narrowing filter never shows nothing", () => {
    const page = applyPlatformQuery(many, q("page=9"));
    expect(page.page).toBe(2);
    expect(page.workspaces).toHaveLength(5);
    expect(applyPlatformQuery([], q("page=4")).page).toBe(0);
  });

  it("searches name and slug, case-insensitively", () => {
    expect(applyPlatformQuery(many, q("q=BUSINESS 07")).workspaces.map((w) => w.id)).toEqual(["ws-07"]);
    expect(applyPlatformQuery(many, q("q=business-12")).workspaces.map((w) => w.id)).toEqual(["ws-12"]);
  });

  it("filters on modules and AI keys", () => {
    const chosen = applyPlatformQuery(many, q("modules=chosen&pageSize=50")).workspaces;
    expect(chosen.length).toBeGreaterThan(0);
    expect(chosen.every((w) => w.modulesRestricted)).toBe(true);
    const own = applyPlatformQuery(many, q("ai=own&pageSize=50")).workspaces;
    expect(own.every((w) => !w.platformAiKeysAllowed)).toBe(true);
  });

  it("sorts by the chosen column in either direction", () => {
    expect(applyPlatformQuery(many, q("sort=members&dir=desc")).workspaces[0].id).toBe("ws-45");
    expect(applyPlatformQuery(many, q("sort=members&dir=asc")).workspaces[0].id).toBe("ws-01");
    expect(applyPlatformQuery(many, q("sort=name")).workspaces[0].id).toBe("ws-01");
    expect(applyPlatformQuery(many, q()).workspaces[0].id).toBe("ws-45"); // newest first
  });
});

describe("platformWorkspaceWhere (the server's version of the same filters)", () => {
  it("is empty with no filters", () => {
    expect(platformWorkspaceWhere(q())).toEqual({});
  });
  it("searches name or slug and applies each filter", () => {
    const where = JSON.stringify(platformWorkspaceWhere(q("q=north&modules=every&ai=gitwork")));
    expect(where).toContain('"contains":"north"');
    expect(where).toContain('"mode":"insensitive"');
    expect(where).toContain('"modulesRestricted":false');
    expect(where).toContain('"platformAiKeysAllowed":true');
  });
});

describe("planWorkspaceUpdate validation", () => {
  const business = { slug: "northwind", modulesRestricted: true, enabledModules: ["clients"], platformAiKeysAllowed: false, updatedAt: "2026-06-01T00:00:00.000Z" };

  it("refuses 'chosen modules' with none chosen", () => {
    expect(() => planWorkspaceUpdate(business, { enabledModules: [] })).toThrow(/Pick at least one module/);
    // Giving every module is the other way out, and is fine.
    expect(planWorkspaceUpdate(business, { modulesRestricted: false, enabledModules: [] }).changed).toBe(true);
  });

  it("refuses a save made against an older copy of the business", () => {
    expect(() =>
      planWorkspaceUpdate(business, { platformAiKeysAllowed: true, expectedUpdatedAt: "2026-05-01T00:00:00.000Z" }),
    ).toThrow(PlatformConflictError);
    expect(
      planWorkspaceUpdate(business, { platformAiKeysAllowed: true, expectedUpdatedAt: "2026-06-01T00:00:00.000Z" }).changed,
    ).toBe(true);
  });
});

describe("draftProblem (the popup says why Save is off)", () => {
  it("names the empty module list, and nothing else", () => {
    expect(draftProblem({ modulesRestricted: true, enabledModules: [], platformAiKeysAllowed: false })).toMatch(/at least one module/);
    expect(draftProblem({ modulesRestricted: false, enabledModules: [], platformAiKeysAllowed: false })).toBeNull();
    expect(draftProblem({ modulesRestricted: true, enabledModules: ["clients"], platformAiKeysAllowed: false })).toBeNull();
  });
});

describe("parsePlatformAuditQuery", () => {
  it("validates paging and the business id", () => {
    expect(parsePlatformAuditQuery(new URLSearchParams("workspaceId=ws_1"))).toEqual({ page: 0, pageSize: 20, workspaceId: "ws_1" });
    expect(() => parsePlatformAuditQuery(new URLSearchParams("workspaceId=a b"))).toThrow(PlatformInputError);
    expect(() => parsePlatformAuditQuery(new URLSearchParams("pageSize=500"))).toThrow(PlatformInputError);
  });
});

describe("the demo applies the same rules", () => {
  it("pages, refuses a bad query and a stale save", () => {
    const page = resolveDemoPlatform("/api/platform/workspaces", undefined, new URLSearchParams()) as { total: number; workspaces: unknown[] };
    expect(page.total).toBeGreaterThan(20);
    expect(page.workspaces).toHaveLength(20);
    expect(resolveDemoPlatform("/api/platform/workspaces", undefined, new URLSearchParams("sort=nope"))).toMatchObject({ __status: 400 });
    expect(
      resolveDemoPlatform("/api/platform/workspaces/ws-northwind-studio", {
        method: "PATCH",
        body: JSON.stringify({ platformAiKeysAllowed: true, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }),
      }),
    ).toMatchObject({ __status: 409 });
    expect(resolveDemoPlatform("/api/platform/workspaces/nope", undefined)).toMatchObject({ __status: 404 });
  });
});
