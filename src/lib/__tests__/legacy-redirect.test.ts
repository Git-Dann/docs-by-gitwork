/**
 * The Staff pages left /app/codeclear (CLAUDE.md §87). Old links — notifications, Slack,
 * bookmarks, the iOS app — must still land on the same view, query string included, and
 * nothing in the app may keep linking to the old prefix.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CODECLEAR_MOVES, movedCodeclearPath, withSearch } from "../legacy-redirect";

const ROOT = join(__dirname, "..", "..", "..");
const APP = join(ROOT, "src", "app", "(app)", "app");

describe("withSearch", () => {
  it("keeps every query param, repeated ones included", () => {
    expect(withSearch("/app/staff/developers", { status: "RECHECK_DUE" })).toBe("/app/staff/developers?status=RECHECK_DUE");
    expect(withSearch("/app/staff/developers", { stack: ["ios", "web"], q: "a b" })).toBe(
      "/app/staff/developers?stack=ios&stack=web&q=a+b",
    );
  });

  it("joins onto a target that already has a query", () => {
    expect(withSearch("/app/staff?view=archived", { q: "x" })).toBe("/app/staff?view=archived&q=x");
  });

  it("adds nothing when there is nothing to add", () => {
    expect(withSearch("/app/staff/hiring", {})).toBe("/app/staff/hiring");
    expect(withSearch("/app/staff/hiring", undefined)).toBe("/app/staff/hiring");
    expect(withSearch("/app/staff/hiring", { a: undefined })).toBe("/app/staff/hiring");
  });
});

describe("where each old path went", () => {
  it.each([
    ["/app/codeclear", "/app/staff/hiring"],
    ["/app/codeclear/pipeline", "/app/staff/hiring/pipeline"],
    ["/app/codeclear/candidates", "/app/staff/developers"],
    ["/app/codeclear/candidates/c1", "/app/staff/hiring/candidates/c1"],
    ["/app/codeclear/devsignal", "/app/staff/hiring/devsignal"],
    ["/app/codeclear/devsignal/challenges", "/app/staff/hiring/devsignal/challenges"],
    ["/app/codeclear/devsignal/model", "/app/staff/hiring/devsignal/model"],
    ["/app/codeclear/devsignal/notice", "/app/staff/hiring/devsignal/notice"],
    ["/app/codeclear/devsignal/ds-9", "/app/staff/hiring/devsignal/ds-9"],
    ["/app/codeclear/archived", "/app/staff?view=archived"],
  ])("%s → %s", (from, to) => {
    expect(movedCodeclearPath(from)).toBe(to);
  });

  it("leaves paths it didn't move alone", () => {
    expect(movedCodeclearPath("/app/codeclearance")).toBeNull();
    expect(movedCodeclearPath("/app/staff")).toBeNull();
  });
});

/** Every page.tsx under a directory, as /app/... route paths. */
function routesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "page.tsx") out.push(p);
    }
  };
  walk(dir);
  return out;
}

describe("the old pages are redirect stubs, and only that", () => {
  const stubs = routesUnder(join(APP, "codeclear"));

  it("every moved path still has a stub", () => {
    for (const path of [
      "codeclear",
      "codeclear/pipeline",
      "codeclear/candidates",
      "codeclear/candidates/[id]",
      "codeclear/devsignal",
      "codeclear/devsignal/challenges",
      "codeclear/devsignal/model",
      "codeclear/devsignal/notice",
      "codeclear/devsignal/[assessmentId]",
      "codeclear/archived",
    ]) {
      expect(existsSync(join(APP, path, "page.tsx")), path).toBe(true);
    }
    expect(stubs).toHaveLength(10);
    // …and the redirect map covers every one of them.
    for (const stub of stubs) {
      const route = "/app/" + relative(APP, stub).replace(/\/page\.tsx$/, "").replace(/\[[^\]]+\]/g, "x");
      expect(CODECLEAR_MOVES.some((m) => m.from.test(route)), route).toBe(true);
    }
  });

  it.each(stubs.map((s) => [relative(APP, s)]))("%s redirects and keeps the query string", (rel) => {
    const src = readFileSync(join(APP, rel), "utf8");
    expect(src).toMatch(/redirect\(withSearch\(/);
    expect(src).toMatch(/await searchParams/);
    // A stub renders nothing of its own: no shell, no component.
    expect(src).not.toMatch(/AppShell|from "@\/components\//);
  });

  it("the new pages exist", () => {
    for (const path of [
      "staff/hiring",
      "staff/hiring/pipeline",
      "staff/hiring/candidates/[id]",
      "staff/hiring/devsignal",
      "staff/hiring/devsignal/challenges",
      "staff/hiring/devsignal/model",
      "staff/hiring/devsignal/notice",
      "staff/hiring/devsignal/[assessmentId]",
      "staff/developers",
    ]) {
      expect(existsSync(join(APP, path, "page.tsx")), path).toBe(true);
    }
  });
});

describe("nothing links to the old prefix", () => {
  it("no /app/codeclear path in src outside the stubs and the code that maps them", () => {
    // These name the old prefix on purpose: the stubs themselves, the redirect map, the
    // permission gates that must still cover the stubs, the demo's link reroute, and tests.
    const allowed = [
      /^src\/app\/\(app\)\/app\/codeclear\//,
      /^src\/lib\/legacy-redirect\.ts$/,
      /^src\/server\/auth\/module-gate\.ts$/,
      /^src\/lib\/workspace-modules\.ts$/,
      /^src\/lib\/demo\/use-demo-nav\.ts$/,
      /^src\/components\/app-shell\.tsx$/,
      /^src\/app\/\(app\)\/app\/staff\/hiring\/candidates\/\[id\]\/opengraph-image\.tsx$/,
      /__tests__\//,
    ];
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) {
          if (name === "node_modules" || name === "__tests__") continue;
          walk(p);
        } else if (/\.tsx?$/.test(name)) {
          const rel = relative(ROOT, p);
          if (allowed.some((re) => re.test(rel))) continue;
          if (/\/app\/codeclear(?![\w-])/.test(readFileSync(p, "utf8"))) offenders.push(rel);
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders).toEqual([]);
  }, 30_000);
});
