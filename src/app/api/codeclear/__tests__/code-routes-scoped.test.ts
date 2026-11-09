/**
 * Staff, Hiring and DevSignal routes work inside the caller's own workspace (multi-tenant
 * Phase 2.2b). They used to read Gitwork's workspace with `ensureBaseRecords()` whoever was
 * asking, and credited notes and activity to the workspace owner instead of the caller.
 * A new route in these folders that does either fails here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const API = join(__dirname, "../..");
const FOLDERS = ["codeclear", "devsignal"];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("Staff, Hiring and DevSignal routes are scoped to the caller's workspace", () => {
  const files = FOLDERS.flatMap((f) => routes(join(API, f)));

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("never look the workspace up with ensureBaseRecords or the Gitwork slug", () => {
    const offenders = files.filter((f) => /DEFAULT_WORKSPACE_SLUG|ensureBaseRecords\(/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(API, f))).toEqual([]);
  });

  it("never pass a null request to the workspace resolvers", () => {
    const offenders = files.filter((f) => /(workspaceIdForRequest|requestActor)\(null\)/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(API, f))).toEqual([]);
  });
});
