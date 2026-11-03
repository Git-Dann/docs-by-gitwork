/**
 * Settings, workspace config, Docs, snippets, roles, the rate card and integrations work inside
 * the caller's workspace (multi-tenant Phase 2.2b). They used to read Gitwork's workspace with
 * `ensureBaseRecords()` or the Gitwork slug whoever was asking.
 *
 * `ensureBaseRecords()` may still appear for one reason: crediting the workspace owner when the
 * caller is the workspace API key (no user). Taking the WORKSPACE from it, or using the slug,
 * fails here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const API = join(__dirname, "..");
const FOLDERS = ["settings", "workspace", "documents", "proposals", "snippets", "roles", "rate-card", "integrations"];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

const GITWORK_WORKSPACE = [
  /DEFAULT_WORKSPACE_SLUG/,
  /\{\s*workspace\b[^}]*\}\s*=\s*await ensureBaseRecords\(/,
  /ensureBaseRecords\(\)\)\.workspace/,
];

describe("settings and Docs routes are scoped to the caller's workspace", () => {
  const files = FOLDERS.flatMap((f) => routes(join(API, f)));

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThan(60);
  });

  it("never take the workspace from ensureBaseRecords or the Gitwork slug", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return GITWORK_WORKSPACE.some((re) => re.test(src));
    });
    expect(offenders.map((f) => relative(API, f))).toEqual([]);
  });
});
