import { describe, expect, it } from "vitest";
import { MODULE_PATHS, hasModuleAccess, matchesPrefix, moduleForPath } from "../module-gate";

// Every /app route segment that exists in the app router. Kept literal on purpose: if
// someone adds a page and doesn't decide how it's gated, the "every route resolves"
// test below fails and tells them to pick.
const APP_ROUTE_SEGMENTS = [
  "account-settings",
  "analytics",
  "assay",
  "backstage",
  "care",
  "clients",
  "code",
  "codeclear",
  "docs",
  "handbook",
  "portal",
  "projects",
  "proof",
  "proposals",
  "pulse",
  "settings",
  "starters",
  "studio",
  "study",
  "support",
  "team",
  "templates",
];

describe("matchesPrefix", () => {
  it("matches exactly", () => {
    expect(matchesPrefix("/app/code", "/app/code")).toBe(true);
  });

  it("matches a child segment", () => {
    expect(matchesPrefix("/app/code/candidates", "/app/code")).toBe(true);
  });

  it("does NOT match a sibling that merely shares the prefix string", () => {
    // The whole point: a bare startsWith would gate /app/codex on `codeclear`.
    expect(matchesPrefix("/app/codex", "/app/code")).toBe(false);
    expect(matchesPrefix("/app/docs-archive", "/app/docs")).toBe(false);
  });
});

describe("moduleForPath", () => {
  it("gates the canonical and legacy route of a module on the same permission", () => {
    expect(moduleForPath("/app/portal")).toBe("clients");
    expect(moduleForPath("/app/clients")).toBe("clients");
    expect(moduleForPath("/app/care")).toBe("support");
    expect(moduleForPath("/app/support")).toBe("support");
    expect(moduleForPath("/app/docs")).toBe("proposals");
    expect(moduleForPath("/app/proposals")).toBe("proposals");
    expect(moduleForPath("/app/code")).toBe("codeclear");
    expect(moduleForPath("/app/codeclear")).toBe("codeclear");
  });

  it("keeps DevSignal on its own admin-only permission, not codeclear", () => {
    // The documented privilege-escalation trap: STAFF auto-inherits `codeclear`, so if a
    // broader prefix ever won this match, admin-only DevSignal would silently open up.
    expect(moduleForPath("/app/codeclear/devsignal")).toBe("devsignal");
    expect(moduleForPath("/app/codeclear/devsignal/candidates/abc")).toBe("devsignal");
  });

  it("gates the three pages that were previously ungated", () => {
    expect(moduleForPath("/app/proof")).toBe("proposals");
    expect(moduleForPath("/app/templates")).toBe("proposals");
    expect(moduleForPath("/app/projects")).toBe("clients");
  });

  it("returns null for paths with no module permission", () => {
    expect(moduleForPath("/app")).toBeNull();
    expect(moduleForPath("/app/settings")).toBeNull();
  });
});

describe("hasModuleAccess", () => {
  it("grants a module only to a member holding it", () => {
    expect(hasModuleAccess("/app/pulse", ["pulse"])).toBe(true);
    expect(hasModuleAccess("/app/pulse/abc/report", ["pulse"])).toBe(true);
    expect(hasModuleAccess("/app/pulse", ["clients"])).toBe(false);
    expect(hasModuleAccess("/app/pulse", [])).toBe(false);
  });

  it("lets any signed-in member reach the ungated pages", () => {
    for (const p of ["/app", "/app/settings", "/app/account-settings", "/app/team", "/app/handbook"]) {
      expect(hasModuleAccess(p, [])).toBe(true);
    }
  });

  it("DENIES an /app path that is in neither list", () => {
    // The regression this replaces: the gate used to `return true` here, which is how
    // /app/proof, /app/templates and /app/projects were reachable by any member.
    expect(hasModuleAccess("/app/some-new-page", [])).toBe(false);
    expect(hasModuleAccess("/app/some-new-page", ["pulse", "clients", "proposals"])).toBe(false);
  });

  it("does not let a prefix-lookalike inherit a module's permission", () => {
    expect(hasModuleAccess("/app/codex", ["codeclear"])).toBe(false);
  });
});

describe("route coverage", () => {
  it("every /app route segment is either gated or explicitly ungated", () => {
    const undecided = APP_ROUTE_SEGMENTS.filter((seg) => {
      const path = `/app/${seg}`;
      // hasModuleAccess with every module permission held: anything still denied has no
      // decision recorded for it in either list.
      return !hasModuleAccess(path, MODULE_PATHS.map((m) => m.module));
    });
    // A failure here means a page under /app has no MODULE_PATHS entry and no row in
    // UNGATED_APP_PREFIXES. Pick one — don't delete this test.
    expect(undecided).toEqual([]);
  });

  it("narrower module prefixes are listed before broader ones", () => {
    // First match wins, so ordering IS the gate. This catches the documented mistake of
    // appending a specific route after the general one.
    MODULE_PATHS.forEach(({ prefix }, i) => {
      const shadowedBy = MODULE_PATHS.slice(0, i).find(
        (earlier) => earlier.prefix !== prefix && matchesPrefix(prefix, earlier.prefix),
      );
      // A broader earlier entry is only acceptable if it resolves to the same module.
      if (shadowedBy) {
        expect(shadowedBy.module).toBe(MODULE_PATHS[i].module);
      }
    });
  });
});
