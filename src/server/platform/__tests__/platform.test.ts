import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// admin.ts reaches NextAuth through effective-user, which a Node test can't boot.
vi.mock("@/server/auth/effective-user", () => ({
  ForbiddenError: class extends Error {},
  requireAuthedUser: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { HOME_WORKSPACE_SLUG, PlatformInputError, planWorkspaceUpdate } from "@/lib/platform-rules";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { isPlatformAdminRecord } from "@/server/platform/admin";
import { describePlatformChange, modulesSummary } from "@/components/platform/platform-console";

const root = join(__dirname, "../../../..");

const business = { slug: "northwind", modulesRestricted: true, enabledModules: ["clients"], platformAiKeysAllowed: false };
const home = { slug: HOME_WORKSPACE_SLUG, modulesRestricted: false, enabledModules: [], platformAiKeysAllowed: true };

describe("platform admin", () => {
  it("is the flag or the seed list, never a workspace role", () => {
    expect(isPlatformAdminRecord({ email: "someone@acme.com", isPlatformAdmin: true })).toBe(true);
    expect(isPlatformAdminRecord({ email: "dan@gitwork.co.uk", isPlatformAdmin: false })).toBe(true);
    expect(isPlatformAdminRecord({ email: "Harry@Gitwork.co.uk ", isPlatformAdmin: false })).toBe(true);
    expect(isPlatformAdminRecord({ email: "owner@acme.com", isPlatformAdmin: false })).toBe(false);
    expect(isPlatformAdminRecord(null)).toBe(false);
  });
});

describe("planWorkspaceUpdate", () => {
  it("refuses a module id that is not in the catalogue", () => {
    expect(() => planWorkspaceUpdate(business, { enabledModules: ["clients", "nope"] })).toThrow(PlatformInputError);
  });

  it("stores modules de-duplicated, in catalogue order, so the same choice is the same value", () => {
    const a = planWorkspaceUpdate(business, { enabledModules: ["proposals", "clients", "clients"] });
    const b = planWorkspaceUpdate(business, { enabledModules: ["clients", "proposals"] });
    expect(a.next.enabledModules).toEqual(b.next.enabledModules);
    expect(a.next.enabledModules).toEqual(["proposals", "clients"]); // Docs precedes Portal in the catalogue
  });

  it("reports no change when nothing changed, so nothing is written or audited", () => {
    expect(planWorkspaceUpdate(business, { enabledModules: ["clients"] }).changed).toBe(false);
    expect(planWorkspaceUpdate(business, {}).changed).toBe(false);
  });

  it("refuses to change Gitwork's own workspace without confirmation", () => {
    expect(() => planWorkspaceUpdate(home, { modulesRestricted: true })).toThrow(/Gitwork's own workspace/);
    expect(() => planWorkspaceUpdate(home, { platformAiKeysAllowed: false })).toThrow(PlatformInputError);
    expect(planWorkspaceUpdate(home, { modulesRestricted: true, confirmHome: true }).changed).toBe(true);
    // Saving Gitwork with nothing changed needs no confirmation.
    expect(planWorkspaceUpdate(home, {}).changed).toBe(false);
  });

  it("knows which workspace is Gitwork's: the shared constant matches the server's", () => {
    expect(HOME_WORKSPACE_SLUG).toBe(DEFAULT_WORKSPACE_SLUG);
  });
});

describe("console wording", () => {
  it("summarises modules for the table", () => {
    expect(modulesSummary({ modulesRestricted: false, enabledModules: [] })).toBe("Every module");
    expect(modulesSummary({ modulesRestricted: true, enabledModules: ["clients", "proposals"] })).toMatch(/^2 of \d+$/);
  });

  it("says what changed, in words", () => {
    expect(
      describePlatformChange({
        before: { modulesRestricted: true, enabledModules: ["clients", "handbook"], platformAiKeysAllowed: true },
        after: { modulesRestricted: true, enabledModules: ["clients", "proposals"], platformAiKeysAllowed: false },
      }),
    ).toBe("added Docs; removed Handbook; switched it to its own AI keys");
    expect(
      describePlatformChange({
        before: { modulesRestricted: false, enabledModules: [], platformAiKeysAllowed: true },
        after: { modulesRestricted: true, enabledModules: ["clients"], platformAiKeysAllowed: true },
      }),
    ).toBe("limited it to chosen modules; added Portal");
  });
});

describe("every way into the Platform console is gated on platform admin", () => {
  const apiDir = join(root, "src/app/api/platform");
  const routeFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? routeFiles(p) : name === "route.ts" ? [p] : [];
    });

  it("each API handler calls requirePlatformAdmin before doing anything", () => {
    const files = routeFiles(apiDir);
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? [];
      const gates = src.match(/await requirePlatformAdmin\(request\)/g) ?? [];
      expect(handlers.length, file).toBeGreaterThan(0);
      expect(gates.length, `${file}: every handler needs requirePlatformAdmin`).toBe(handlers.length);
    }
  });

  it("the page 404s for anyone who isn't one, read live from the database", () => {
    const page = readFileSync(join(root, "src/app/(app)/app/platform/page.tsx"), "utf8");
    expect(page).toMatch(/if \(!\(await isPlatformAdminUserId\(session\?\.user\?\.id\)\)\) notFound\(\);/);
  });

  it("the page is internal-only at the module gate", () => {
    const gate = readFileSync(join(root, "src/server/auth/module-gate.ts"), "utf8");
    const internal = gate.slice(gate.indexOf("export const INTERNAL_ONLY_PREFIXES"));
    expect(internal.slice(0, internal.indexOf("];"))).toContain('"/app/platform"');
  });
});
