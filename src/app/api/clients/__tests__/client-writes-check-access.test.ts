import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every write under /api/clients/[slug] asks whether the caller can work on THAT client
 * (CLAUDE.md §135). Finding the client in the caller's workspace is not enough: before this,
 * any signed-in member could edit any client's wiki documents, users and share link.
 */
const ROOT = join(process.cwd(), "src/app/api/clients/[slug]");
const GUARDS =
  /assertClientWriter\(|assertClientAccessBySlug\(|assertClientInScope\(|assertMonitorWriter\(|resolveInternal\w*\(|requireForgeImporter\(|assertCan\(|assertAtLeastAdmin\(|assertSuperAdmin\(|requireTeamAdmin\(|canManageClients\(/;

function routes(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "__tests__") routes(p, out);
    } else if (e === "route.ts") out.push(p);
  }
  return out;
}

function writeHandlers(src: string): { method: string; body: string }[] {
  const out: { method: string; body: string }[] = [];
  const re = /export async function (POST|PUT|PATCH|DELETE)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const next = src.indexOf("\nexport async function ", m.index + 1);
    out.push({ method: m[1], body: src.slice(m.index, next === -1 ? src.length : next) });
  }
  return out;
}

describe("client write routes check access to the client", () => {
  const files = routes(ROOT);

  it("finds the routes (a broken walk would pass for ever)", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("every POST/PUT/PATCH/DELETE calls a client-access guard", () => {
    const missing: string[] = [];
    for (const f of files) {
      for (const h of writeHandlers(readFileSync(f, "utf8"))) {
        if (!GUARDS.test(h.body)) missing.push(`${h.method} ${f.replace(ROOT, "[slug]")}`);
      }
    }
    expect(missing, `write handlers with no client-access check:\n${missing.join("\n")}`).toEqual([]);
  });
});
