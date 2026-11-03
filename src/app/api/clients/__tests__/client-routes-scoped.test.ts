/**
 * Every handler under `api/clients/[slug]/` finds its client in the caller's workspace
 * (multi-tenant Phase 2.2b, Portal).
 *
 * Slugs are unique per workspace, not globally, and these routes used to look the slug up in
 * Gitwork's workspace whoever was asking. The isolation suite can't prove each route (it sends
 * `{}` bodies, and a read only shows a leak when the response carries seeded text), so a new
 * route here has to say how it is scoped, and this test fails until it does.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const api = join(__dirname, "..", "..");
const ROOT = join(api, "clients", "[slug]");

/** Any of these, inside the handler, means the slug is resolved in the caller's workspace. */
const SCOPED_BY = [
  "clientIdForSlug(",
  "requireClientIdForSlug(",
  "workspaceIdForRequest(",
  "requestWorkspaceId(",
  "user.workspaceId",
  // Shared resolvers that scope to the caller's workspace themselves:
  "resolveInternalChangelog(", // src/server/wiki-changelog-access.ts
  "resolveInternalSheets(", // src/server/wiki-sheets-access.ts
  "resolveInternalLaunchpadTarget(", // src/server/launchpad-access.ts (takes the request)
  "WikiLink(user,", // src/server/wiki-links.ts (scopes to user.workspaceId)
  "WikiLinks(user,",
  "resolveClientId(req, slug)", // wiki/users: a local helper on requireAuthedUser's workspace
];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

function handlers(file: string): Array<{ method: string; body: string }> {
  return readFileSync(file, "utf8")
    .split(/(?=export async function (?:GET|POST|PUT|PATCH|DELETE)\b)/)
    .slice(1)
    .map((body) => ({ method: body.match(/export async function (\w+)/)?.[1] ?? "?", body }));
}

describe("Portal client routes are scoped to the caller's workspace", () => {
  const files = routes(ROOT);

  it("finds the routes (a broken walker would pass everything)", () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it("every handler resolves its client in the caller's workspace", () => {
    const unscoped: string[] = [];
    for (const file of files) {
      for (const { method, body } of handlers(file)) {
        if (!SCOPED_BY.some((needle) => body.includes(needle))) unscoped.push(`${method} ${relative(api, file)}`);
      }
    }
    expect(unscoped, "Resolve the client with clientIdForSlug(slug, req) in these handlers").toEqual([]);
  });

  it("no route looks a slug up in Gitwork's workspace", () => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes("ensureBaseRecords("));
    expect(offenders.map((f) => relative(api, f))).toEqual([]);
  });

  it("routes that name a row under the client check it belongs to that client", () => {
    const cases: Array<[string, string]> = [
      ["platforms/[platformId]/route.ts", "requireRowOfClient(\"platform\""],
      ["designs/[designId]/route.ts", "requireRowOfClient(\"design\""],
      ["document-links/[linkId]/route.ts", "requireRowOfClient(\"documentLink\""],
      ["wiki/intake-items/[id]/route.ts", "requireRowOfClient(\"intakeItem\""],
      ["wiki/intake-items/[id]/promote/route.ts", "requireRowOfClient(\"intakeItem\""],
    ];
    for (const [path, needle] of cases) {
      for (const { method, body } of handlers(join(ROOT, path))) expect(body, `${method} ${path}`).toContain(needle);
    }
  });
});
