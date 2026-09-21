/**
 * The MCP tool list exists in THREE places and nothing checked they agreed.
 *
 *   1. `src/server/mcp/handler.ts`                    — the registry that actually runs
 *   2. `src/components/settings/mcp-tools-catalog.tsx` — what a user reads before enabling it
 *   3. `scripts/mcp-smoke.ts`                          — a manual smoke script
 *
 * The catalog's own header comment says "keep this list in step with TOOLS in handler.ts
 * (the mcp-smoke test guards the count there)". It did not: `mcp-smoke` is not wired into
 * `verify` or CI, so nothing ran it — and the catalog had silently fallen TWO tools behind
 * (`create_course_request`, `list_course_requests`) before this test was written.
 *
 * That matters because the catalog is the page someone reads to decide what Claude can do
 * with their workspace. A tool missing from it is a capability nobody knows they granted;
 * a tool listed that does not exist is a promise the product cannot keep.
 *
 * Source text rather than imports: the catalog is a `"use client"` component and the
 * handler pulls in Prisma and the whole server tree, neither of which a node test wants.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** Every `name: "..."` at a tool-entry's indentation. */
function toolNames(relative: string): string[] {
  const src = readFileSync(join(ROOT, relative), "utf8");
  return [...src.matchAll(/^ {4}name: "([a-z_]+)",$/gm)].map((m) => m[1]).sort();
}

const handler = toolNames("src/server/mcp/handler.ts");
const catalog = toolNames("src/components/settings/mcp-tools-catalog.tsx");

describe("MCP tool lists agree", () => {
  it("finds tools at all — a broken matcher would pass everything silently", () => {
    // Without this, a regex that matched nothing would report two empty lists as equal.
    expect(handler.length).toBeGreaterThan(20);
    expect(catalog.length).toBeGreaterThan(20);
  });

  it("every registered tool is described in the user-facing catalog", () => {
    const missing = handler.filter((n) => !catalog.includes(n));
    expect(missing, `not in mcp-tools-catalog.tsx: ${missing.join(", ")}`).toEqual([]);
  });

  it("the catalog describes no tool that does not exist", () => {
    const phantom = catalog.filter((n) => !handler.includes(n));
    expect(phantom, `in the catalog but not registered: ${phantom.join(", ")}`).toEqual([]);
  });

  it("the smoke script's expected list and count match the registry", () => {
    // Not run by `verify` (it needs a live server), so it drifts unwatched. Its
    // expectations are plain text and can be checked here for free.
    const smoke = readFileSync(join(ROOT, "scripts/mcp-smoke.ts"), "utf8");
    // ⚠️ Read the COMPARISON, not the message beside it. The count appears twice —
    // `check("returns 35 tools", tools.length === 35, …)` — and the first version of
    // this test read only the prose. Changing the comparison to 34 left the message
    // saying 35, so the test passed against a script that would now fail for real.
    const compared = smoke.match(/tools\.length === (\d+)/);
    expect(compared, "mcp-smoke.ts no longer compares a tool count").toBeTruthy();
    expect(Number(compared![1]), "mcp-smoke.ts asserts the wrong tool count").toBe(handler.length);

    const stated = smoke.match(/returns (\d+) tools/);
    expect(stated, "mcp-smoke.ts no longer states a tool count").toBeTruthy();
    expect(Number(stated![1]), "mcp-smoke.ts's message disagrees with its own assertion").toBe(
      handler.length,
    );

    const block = smoke.slice(smoke.indexOf("const expected = ["));
    const listed = [...block.slice(0, block.indexOf("]")).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const missing = handler.filter((n) => !listed.includes(n));
    expect(missing, `not in mcp-smoke.ts's expected list: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("running-cost tools are registered", () => {
  it.each([
    "get_running_costs",
    "set_cost_line",
    "delete_cost_line",
    "set_running_costs_settings",
  ])("%s", (name) => {
    expect(handler).toContain(name);
  });

  it("the three writers are gated on 'Manage clients'", () => {
    // Reading a cost model is fine for anyone who can see the client; writing one
    // changes a figure the client reads, so it takes the same permission the REST
    // routes require. A tool that forgot would be a quiet privilege hole.
    const src = readFileSync(join(ROOT, "src/server/mcp/handler.ts"), "utf8");
    for (const name of ["set_cost_line", "delete_cost_line", "set_running_costs_settings"]) {
      const start = src.indexOf(`name: "${name}",`);
      const end = src.indexOf('    name: "', start + 20);
      const block = src.slice(start, end === -1 ? undefined : end);
      expect(block, `${name} is not gated`).toContain("assertCan(user, canManageClients");
    }
  });
});
