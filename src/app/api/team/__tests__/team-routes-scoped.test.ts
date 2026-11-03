/**
 * Every team route works inside the caller's own workspace and checks the caller's role from
 * the database (multi-tenant Phase 2.2b, §57).
 *
 * The routes used to find the workspace by the Gitwork slug and the role from the session
 * token, which is fixed at sign-in. A new team route that does either fails here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("team routes are scoped to the caller's workspace", () => {
  const files = routes(ROOT);

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("never look the workspace up by the Gitwork slug or ensureBaseRecords", () => {
    const offenders = files.filter((f) => /DEFAULT_WORKSPACE_SLUG|ensureBaseRecords\(/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("never trust the role in the session token", () => {
    const offenders = files.filter((f) => /session\.user\.role|from "@\/auth"/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
