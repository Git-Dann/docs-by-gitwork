/**
 * Environments (Nov 2026): the client's copy of a wiki carries production monitors only, and
 * every route that changes a monitor checks the caller may work on that client — the Monitors
 * page offers Edit for any client's monitor, so the route is what actually decides.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the client's copy", () => {
  it("trims monitors and incidents to production before the wiki leaves on a token", () => {
    const wiki = src("src/server/wiki.ts");
    const body = wiki.slice(wiki.indexOf("function forPublic("), wiki.indexOf("visibleSections: clientVisibleSections(trimmed)"));
    expect(body).toMatch(/monitors: clientVisibleMonitors\(dto\.monitors\.monitors\)/);
    expect(body).toMatch(/incidents: clientVisibleIncidents\(dto\.monitors\.incidents/);
  });

  it("the team's 'what the client sees' preview applies the same rule", () => {
    expect(src("src/components/clients/wiki/monitors-section.tsx")).toMatch(
      /<MonitorStatusBoard monitors=\{clientVisibleMonitors\(monitors\)\} incidents=\{clientVisibleIncidents\(incidents, monitors\)\}/,
    );
  });
});

describe("who may change a monitor", () => {
  const routes: Array<[string, string[]]> = [
    ["src/app/api/clients/[slug]/wiki/monitors/route.ts", ["GET", "POST"]],
    ["src/app/api/clients/[slug]/wiki/monitors/[id]/route.ts", ["PATCH", "DELETE"]],
    ["src/app/api/clients/[slug]/wiki/monitors/[id]/run/route.ts", ["POST"]],
  ];
  for (const [file, methods] of routes) {
    for (const method of methods) {
      it(`${method} ${file.replace("src/app", "")} checks the caller`, () => {
        const s = src(file);
        const start = s.indexOf(`export async function ${method}(`);
        expect(start, `${method} missing`).toBeGreaterThan(-1);
        const next = s.indexOf("export async function", start + 1);
        const handler = s.slice(start, next === -1 ? undefined : next);
        expect(handler).toMatch(/await assertMonitorWriter\(req, slug\)/);
      });
    }
  }
});
