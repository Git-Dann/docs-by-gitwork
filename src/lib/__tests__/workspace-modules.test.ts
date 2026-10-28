import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_MODULES,
  WORKSPACE_MODULES,
  WORKSPACE_MODULE_IDS,
  resolveWorkspaceModules,
  workspaceAllowsPath,
  workspaceHasModule,
  workspaceModuleForPath,
} from "@/lib/workspace-modules";
import { MODULE_PATHS } from "@/server/auth/module-gate";

const root = join(__dirname, "../../..");

describe("workspace module switch — rules", () => {
  it("an unrestricted workspace (null) and an old token (undefined) reach everything", () => {
    for (const modules of [null, undefined]) {
      expect(workspaceAllowsPath("/app/pulse", modules)).toBe(true);
      expect(workspaceAllowsPath("/api/support/clients", modules)).toBe(true);
      expect(workspaceAllowsPath("/deck", modules)).toBe(true);
      expect(workspaceHasModule("labs", modules)).toBe(true);
    }
  });

  it("a restricted workspace is refused pages and APIs of modules it does not have", () => {
    const modules = ["clients", "proposals"];
    expect(workspaceAllowsPath("/app/pulse", modules)).toBe(false);
    expect(workspaceAllowsPath("/app/pulse/scan-1", modules)).toBe(false);
    expect(workspaceAllowsPath("/api/pulse/scans", modules)).toBe(false);
    expect(workspaceAllowsPath("/app/care", modules)).toBe(false);
    expect(workspaceAllowsPath("/deck", modules)).toBe(false);
    expect(workspaceAllowsPath("/app/settings/labs", modules)).toBe(false);
    expect(workspaceAllowsPath("/app/docs/d1", modules)).toBe(true);
    expect(workspaceAllowsPath("/app/portal/acme", modules)).toBe(true);
  });

  it("shared ground is never refused, even with no modules at all", () => {
    for (const path of ["/app", "/app/settings", "/app/settings/account", "/app/account-settings", "/app/messages", "/api/account", "/api/notifications", "/api/health"]) {
      expect(workspaceAllowsPath(path, [])).toBe(true);
    }
  });

  it("matches on a path segment, so lookalike paths are not caught", () => {
    expect(workspaceModuleForPath("/apply")).toBeNull();
    expect(workspaceModuleForPath("/app/pulsewave")).toBeNull();
    // The PUBLIC scanner is Gitwork's own sales widget, not the Pulse module.
    expect(workspaceModuleForPath("/api/public/pulse/scan")).toBeNull();
    expect(workspaceModuleForPath("/decks")).toBeNull();
  });

  it("the longest prefix wins: Hiring inside Staff's tree belongs to Hiring", () => {
    expect(workspaceModuleForPath("/app/codeclear/devsignal/ds-1")).toBe("devsignal");
    expect(workspaceModuleForPath("/app/codeclear/candidates")).toBe("codeclear");
    expect(workspaceAllowsPath("/app/codeclear/devsignal", ["codeclear"])).toBe(false);
    expect(workspaceAllowsPath("/app/codeclear/candidates", ["codeclear"])).toBe(true);
  });

  it("resolves the stored columns: unrestricted → null, restricted → known ids only", () => {
    expect(resolveWorkspaceModules({ modulesRestricted: false, enabledModules: ["pulse"] })).toBeNull();
    expect(resolveWorkspaceModules(null)).toBeNull();
    expect(resolveWorkspaceModules({ modulesRestricted: true, enabledModules: [] })).toEqual([]);
    expect(resolveWorkspaceModules({ modulesRestricted: true, enabledModules: ["clients", "nonsense"] })).toEqual(["clients"]);
  });
});

describe("workspace module switch — catalogue", () => {
  it("has unique ids", () => {
    expect(new Set(WORKSPACE_MODULE_IDS).size).toBe(WORKSPACE_MODULE_IDS.length);
  });

  it("every gated /app module path sits under a workspace module, so none escapes the switch", () => {
    for (const { prefix } of MODULE_PATHS) {
      expect(workspaceModuleForPath(prefix), `${prefix} has no workspace module`).not.toBeNull();
    }
  });

  it("every prefix names a route that exists (a typo would silently gate nothing)", () => {
    const routeDir = (p: string) => {
      if (p.startsWith("/api/")) return join(root, "src/app", p);
      if (p.startsWith("/app")) return join(root, "src/app/(app)", p);
      return null;
    };
    for (const m of WORKSPACE_MODULES) {
      for (const p of [...m.pagePrefixes, ...m.apiPrefixes]) {
        const dir = routeDir(p);
        // /app/settings/<section> is a dynamic [section] route, and /deck, /canvas,
        // /edge are static shells or top-level routes — checked separately below.
        if (!dir || p.startsWith("/app/settings/")) continue;
        expect(existsSync(dir), `${p} (${m.id}) does not exist`).toBe(true);
      }
    }
    expect(existsSync(join(root, "public/deck/index.html"))).toBe(true);
    expect(existsSync(join(root, "public/canvas/index.html"))).toBe(true);
    expect(existsSync(join(root, "src/app/edge/page.tsx"))).toBe(true);
  });

  it("the default business bundle is real modules, and leaves out Gitwork's own", () => {
    for (const id of DEFAULT_BUSINESS_MODULES) expect(WORKSPACE_MODULE_IDS).toContain(id);
    for (const id of ["pulse", "provenance", "devsignal", "labs", "starters", "analytics", "support"]) {
      expect(DEFAULT_BUSINESS_MODULES as readonly string[]).not.toContain(id);
    }
  });
});

describe("workspace module switch — enforcement order", () => {
  const middleware = readFileSync(join(root, "src/middleware.ts"), "utf8");

  it("runs on /app pages BEFORE every role check, so a Super Admin is refused too", () => {
    const gate = middleware.indexOf("!workspaceAllowsPath(pathname, req.auth.user.workspaceModules)");
    expect(gate).toBeGreaterThan(-1);
    for (const roleCheck of [
      'pathname.startsWith("/app/starters") && !isAtLeast',
      'pathname.startsWith("/app/handbook") && !isAtLeast',
      'if (!isAtLeast(req.auth.user.role, "ADMIN")) {',
    ]) {
      const at = middleware.indexOf(roleCheck);
      expect(at, roleCheck).toBeGreaterThan(-1);
      expect(gate, `the module switch must run before: ${roleCheck}`).toBeLessThan(at);
    }
  });

  it("also guards the API for signed-in callers, with a 403", () => {
    expect(middleware).toMatch(/req\.auth\?\.user && !workspaceAllowsPath\(pathname, req\.auth\.user\.workspaceModules\)/);
  });

  it("is refreshed on the session recheck, not only at sign-in", () => {
    const auth = readFileSync(join(root, "src/auth.ts"), "utf8");
    expect(auth.match(/token\.workspaceModules = /g)?.length).toBe(2);
  });

  it("guards /edge, which is outside the middleware's /app branch", () => {
    const edge = readFileSync(join(root, "src/app/edge/page.tsx"), "utf8");
    expect(edge).toContain('workspaceAllowsPath("/edge", session.user.workspaceModules)');
  });
});
