/**
 * Every handler under `api/documents/[id]/` and `api/proposals/[id]/` checks the document is in
 * the caller's workspace before it does anything (multi-tenant Phase 2.2b).
 *
 * The isolation suite can't prove this route by route: it sends `{}` bodies, so many writes stop
 * at validation, and a read only shows a leak when the response happens to carry seeded text.
 * So a new route here has to say how it is scoped, and this test fails until it does.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const api = join(__dirname, "..", "..", "app", "api");
const ROOTS = [join(api, "documents", "[id]"), join(api, "proposals", "[id]")];

/** Any of these, inside the handler, means it is scoped. */
const SCOPED_BY = [
  "requireDocumentInWorkspace(", // the guard every sub-route uses
  "docsWorkspaceId(", // routes that filter their own query by workspace
  "updateDocument(", // delegates to updateDocument, which scopes itself
];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("Docs routes are scoped to the caller's workspace", () => {
  const files = ROOTS.flatMap(routes);

  it("finds the routes (a broken walker would pass everything)", () => {
    expect(files.length).toBeGreaterThan(25);
  });

  it("every handler checks the document's workspace", () => {
    const unscoped: string[] = [];
    for (const file of files) {
      const handlers = readFileSync(file, "utf8").split(/(?=export async function (?:GET|POST|PUT|PATCH|DELETE)\b)/).slice(1);
      for (const body of handlers) {
        const method = body.match(/export async function (\w+)/)?.[1];
        if (!SCOPED_BY.some((needle) => body.includes(needle))) unscoped.push(`${method} ${relative(api, file)}`);
      }
    }
    expect(unscoped, "Add requireDocumentInWorkspace(id, user) to these handlers").toEqual([]);
  });

  it("routes that name a row under the document check it belongs to that document", () => {
    for (const sub of ["comments/[commentId]", "versions/[versionId]", "signature-requests/[requestId]/send"]) {
      const source = readFileSync(join(api, "documents", "[id]", sub, "route.ts"), "utf8");
      const handlers = source.split(/(?=export async function )/).slice(1);
      for (const body of handlers) expect(body, sub).toContain("requireRowOfDocument(");
    }
  });
});
