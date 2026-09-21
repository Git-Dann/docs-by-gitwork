import { describe, expect, it } from "vitest";
import { MODULE_PATHS, hasModuleAccess, matchesPrefix, moduleForPath,
  INTERNAL_ONLY_PREFIXES,
  isExternalRole,
  UNGATED_APP_PREFIXES,
} from "../module-gate";

// Every /app route segment that exists in the app router. Kept literal on purpose: if
// someone adds a page and doesn't decide how it's gated, the "every route resolves"
// test below fails and tells them to pick.
const APP_ROUTE_SEGMENTS = [
  "account-settings",
  "analytics",
  "provenance",
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

describe("a guest is not a colleague", () => {
  // The allow-list was written when every account was an @gitwork.co.uk Google sign-in,
  // so "any signed-in member" and "any colleague" were the same sentence. GUEST breaks
  // that, and the pages below were open because nobody had to decide to open them.
  const GUEST = "GUEST";

  it.each(INTERNAL_ONLY_PREFIXES)("denies a guest %s", (prefix) => {
    expect(
      hasModuleAccess(prefix, [], GUEST),
      `${prefix} is internal — a guest holding an email and password must not reach it`,
    ).toBe(false);
    expect(hasModuleAccess(`${prefix}/anything`, [], GUEST)).toBe(false);
  });

  it.each(INTERNAL_ONLY_PREFIXES)("still allows a developer %s", (prefix) => {
    // The split is by audience, not sensitivity — internal staff keep what they had.
    //
    // ⚠️ An internal-only path may ALSO carry a module gate: `/app/pulse/embed` sits
    // under /app/pulse, so it needs the `pulse` permission on top of being internal.
    // The two rules compose, so the developer here is given whatever module the path
    // requires — otherwise this asserts the module gate, not the audience rule.
    const required = moduleForPath(prefix);
    expect(hasModuleAccess(prefix, required ? [required] : [], "DEVELOPER")).toBe(true);
  });

  it.each(INTERNAL_ONLY_PREFIXES)("denies a guest %s even WITH the module", (prefix) => {
    // The whole point of evaluating the deny first: holding the module must not be a
    // way round the audience rule.
    const required = moduleForPath(prefix);
    expect(hasModuleAccess(prefix, required ? [required] : [], "GUEST")).toBe(false);
  });

  it("keeps a guest's own settings, account and messages open", () => {
    // These are about the signed-in person, whoever they are. Locking a guest out of
    // their own account settings would leave them unable to change their password.
    for (const p of UNGATED_APP_PREFIXES) {
      expect(hasModuleAccess(p, [], GUEST), p).toBe(true);
    }
  });

  it("grants a guest exactly the module they were given, and nothing adjacent", () => {
    expect(hasModuleAccess("/app/pulse", ["pulse"], GUEST)).toBe(true);
    expect(hasModuleAccess("/app/care", ["pulse"], GUEST)).toBe(false);
    expect(hasModuleAccess("/app/portal", ["pulse"], GUEST)).toBe(false);
  });

  it("treats an ABSENT role as internal", () => {
    // Every caller that predates GUEST passes a staff account, so omitting the argument
    // must not silently lock existing users out. External is denied explicitly.
    expect(hasModuleAccess("/app/handbook", [])).toBe(true);
    expect(hasModuleAccess("/app/handbook", [], null)).toBe(true);
  });

  it("names GUEST as external and no staff role as external", () => {
    expect(isExternalRole("GUEST")).toBe(true);
    for (const role of ["SUPER_ADMIN", "ADMIN", "STAFF", "DEVELOPER", null, undefined, ""]) {
      expect(isExternalRole(role), String(role)).toBe(false);
    }
  });

  it("puts every prefix in exactly one of the two lists", () => {
    // Both lists are consulted, so an entry in both would make the internal-only rule
    // unreachable — the guest check would never run for it.
    const overlap = UNGATED_APP_PREFIXES.filter((p) => INTERNAL_ONLY_PREFIXES.includes(p));
    expect(overlap).toEqual([]);
  });
});
