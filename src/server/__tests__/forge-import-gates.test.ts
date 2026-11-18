/**
 * Who can import a client's plan, and that a product card is never swept away by the 30-day
 * auto-archive. Source-level: the routes and MCP handler pull in the whole server tree.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("importing a plan is for Admins with access to the client", () => {
  it("both routes go through the one gate before doing anything", () => {
    for (const r of ["plan", "apply"]) {
      const src = read(`src/app/api/clients/[slug]/forge-import/${r}/route.ts`);
      expect(src, r).toMatch(/await requireForgeImporter\(req, slug\)/);
      expect(src.indexOf("requireForgeImporter(req, slug)"), r).toBeLessThan(src.indexOf("ForgeImport({"));
    }
  });

  it("the gate needs a real person, an Admin, with access to that client", () => {
    const gate = read("src/server/forge-import-access.ts");
    expect(gate).toMatch(/requireAuthedUser\(req\)/);
    expect(gate).toMatch(/assertAtLeastAdmin\(user\)/);
    expect(gate).toMatch(/assertClientAccessBySlug\(user, slug\)/);
  });

  it("the MCP tools refuse anyone below Admin", () => {
    const h = read("src/server/mcp/handler.ts");
    for (const name of ["forge_import_plan", "forge_import_apply"]) {
      const block = h.slice(h.indexOf(`name: "${name}"`), h.indexOf(`name: "${name}"`) + 4000);
      expect(block, name).toMatch(/if \(!isAtLeast\(user\.role, "ADMIN"\)\) throw new ForbiddenError/);
    }
  });

  it("applying requires the decisions list, even when it's empty", () => {
    expect(read("src/lib/forge-import/schemas.ts")).toMatch(/approvedReviewLinks: z\.array\(forgeDecisionSchema\)\.max\(500\),/);
  });
});

describe("product cards are never auto-archived", () => {
  it("the 30-day sweep skips any task with a type", () => {
    const src = read("src/server/tasks.ts");
    const fn = src.slice(src.indexOf("export async function autoArchiveDoneTasks"), src.indexOf("export async function respondToWikiBlocker"));
    expect(fn).toMatch(/itemType: null,/);
  });
});
