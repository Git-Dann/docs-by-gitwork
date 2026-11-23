import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "@/testing/source";

/**
 * Care is one UI at /app/care. The legacy /app/support dashboard is gone; its routes are
 * redirect stubs. These guards keep it that way, and keep each moved capability behind the
 * same permission it had before the move.
 */
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) out.push(full.replace(root + "/", ""));
  }
  return out;
}

/** Files allowed to name /app/support: the stubs, the mapping, and the two prefix tables. */
const ALLOWED = new Set([
  "src/app/(app)/app/support/page.tsx",
  "src/app/(app)/app/support/reports/[reportId]/page.tsx",
  "src/app/(app)/app/support/[...rest]/page.tsx",
  "src/lib/care-links.ts",
  "src/server/auth/module-gate.ts",
  "src/lib/workspace-modules.ts",
  // Prompt text in the starters library, not a link.
  "src/server/starters-catalog.ts",
]);

describe("Care is one UI", () => {
  const files = walk(join(root, "src"));

  it("sweeps the source tree", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("no link into /app/support remains outside the redirect stubs", () => {
    const offenders = files.filter(
      (f) => !ALLOWED.has(f) && stripComments(read(f)).includes("/app/support"),
    );
    expect(offenders).toEqual([]);
  });

  it("the legacy dashboard is gone and nothing imports it", () => {
    expect(existsSync(join(root, "src/components/support/support-dashboard.tsx"))).toBe(false);
    expect(files.filter((f) => read(f).includes("support-dashboard"))).toEqual([]);
  });

  it("the /app/support pages are redirects and nothing else", () => {
    for (const f of [
      "src/app/(app)/app/support/page.tsx",
      "src/app/(app)/app/support/reports/[reportId]/page.tsx",
      "src/app/(app)/app/support/[...rest]/page.tsx",
    ]) {
      const src = stripComments(read(f));
      expect(src).toMatch(/redirect\(legacy(Support|Report)Redirect\(/);
      expect(src).not.toMatch(/<[A-Z]\w*(\s|\/?>)/); // renders no component (a generic like Promise<Record<…>> is not JSX)
    }
  });

  it("every page under /app/support is one of the redirect stubs", () => {
    const pages = files.filter((f) => f.startsWith("src/app/(app)/app/support/") && f.endsWith("/page.tsx")).sort();
    expect(pages).toEqual([
      "src/app/(app)/app/support/[...rest]/page.tsx",
      "src/app/(app)/app/support/page.tsx",
      "src/app/(app)/app/support/reports/[reportId]/page.tsx",
    ]);
  });

  it("the printable report lives under /app/care", () => {
    expect(existsSync(join(root, "src/app/(app)/app/care/reports/[reportId]/page.tsx"))).toBe(true);
  });

  it("every moved capability is reachable from the cockpit or Care home", () => {
    const cockpit = read("src/components/care/client-cockpit.tsx");
    /*
     * ⚠️ `TicketsTableView` left this list in Nov 2026, and that is the ONE removal this guard
     * is allowed: Tickets was retired, not mislaid. The cockpit never wrote a ticket — `tickets/`
     * was a view of rows nothing created, and the two metric routes under it read conversations
     * — so keeping the tab meant offering a screen that could only ever be empty. Everything else
     * here is a capability the legacy dashboard exclusively owned; dropping one to make this test
     * pass is how the one-UI merge would quietly regress.
     */
    for (const name of ["ReportsView", "CareAutomationView", "ConnectorsView", "PortalLinkCard", "HealthBadge", "useSemanticSearch"]) {
      expect(cockpit, name).toContain(name);
    }
    expect(read("src/components/care/care-home.tsx")).toContain("AddClientModal");
  });

  it("Tickets is retired from the UI, but its tables and write routes are kept", () => {
    // Dropping a table or an enum value is a data-losing schema change, and the guarded
    // `prisma db push` skips the WHOLE sync when it sees one (CLAUDE.md §2). An integration
    // could also still POST a ticket, so the write routes stay.
    expect(read("src/lib/care-links.ts")).not.toMatch(/"tickets"/);
    expect(existsSync(join(root, "src/components/care/care-tickets.tsx"))).toBe(false);
    expect(existsSync(join(root, "src/components/care/care-tickets-kanban.tsx"))).toBe(false);
    expect(existsSync(join(root, "src/app/api/support/clients/[clientId]/tickets/route.ts"))).toBe(true);
    expect(read("prisma/schema.prisma")).toMatch(/model SupportTicket\b/);
  });

  it("the performance strip reads conversations, so it survives Tickets", () => {
    // `getPerformanceMetricsForPeriod` touches SupportTicket nowhere — it was only ever named
    // for tickets. The byte-identical `tickets/performance` and `tickets/stats` routes are gone;
    // the conversations ones they duplicated are what the strip and the report pre-fill call.
    // Matched on the REQUEST PATH, not on any mention: the comment above each fetcher names the
    // retired route it used to call, and a bare `toContain` would read that as the bug.
    const api = read("src/lib/api.ts");
    const fetched = [...api.matchAll(/apiFetch\(`([^`]+)`/g)].map((m) => m[1]);
    expect(fetched.some((p) => p.includes("/conversations/performance"))).toBe(true);
    expect(fetched.filter((p) => /\/tickets\/(performance|stats)/.test(p))).toEqual([]);
    expect(existsSync(join(root, "src/app/api/support/clients/[clientId]/conversations/performance/route.ts"))).toBe(true);
    expect(existsSync(join(root, "src/app/api/support/clients/[clientId]/tickets/performance/route.ts"))).toBe(false);
  });
});

describe("permission gates are unchanged by the move", () => {
  it("Add client is only offered to whoever may manage Care (the route asserts the same)", () => {
    /*
     * Asserted on the GATE rather than on the control's shape. It used to pin
     * `const addClientButton = canManageSupport ?` — a 10px mono text link in the Clients panel's
     * header that REPLACED the client count — so the redesign that made it a real button in the
     * hero failed a test about permissions for a reason that had nothing to do with permissions.
     * What matters is that every "Add client" affordance sits behind `canManageSupport`.
     */
    const home = stripComments(read("src/components/care/care-home.tsx"));
    const mentions = [...home.matchAll(/Add client/g)];
    expect(mentions.length, "Care home should offer Add client").toBeGreaterThan(0);
    for (const m of mentions) {
      const before = home.slice(Math.max(0, m.index! - 400), m.index!);
      expect(before, "every Add client control must be behind canManageSupport").toContain("canManageSupport");
    }
    expect(stripComments(read("src/app/api/support/clients/route.ts"))).toMatch(/assertCan\(user, canManageSupport/);
  });

  it("workflow rules: add, edit, delete and restore-defaults are manage-only", () => {
    const src = stripComments(read("src/components/care/care-automation.tsx"));
    const view = src.slice(src.indexOf("export function CareAutomationView"));
    expect(view).toMatch(/canManageSupport \? \(\s*<button[\s\S]*?Add rule/);
    expect(view).toMatch(/canManageSupport \? \(\s*<Button[\s\S]*?Restore defaults/);
    expect(view).toMatch(/canManageSupport \? \(\s*<div[\s\S]*?Edit rule[\s\S]*?Delete rule/);
  });

  it("the Portal link can only be saved by whoever may manage Care", () => {
    const src = stripComments(read("src/components/care/care-automation.tsx"));
    const card = src.slice(src.indexOf("export function PortalLinkCard"), src.indexOf("export function CareAutomationView"));
    expect(card).toMatch(/disabled=\{!canManageSupport\}/);
    expect(card).toMatch(/canManageSupport \? \(\s*<Button/);
  });

  it("the course-requests mode switch stays manage-only", () => {
    expect(read("src/components/care/client-cockpit.tsx")).toMatch(
      /showCourseMode = canManageSupport && \(hasCourseRequests/,
    );
  });

  it("connectors and reports still read their own permission", () => {
    expect(read("src/components/care/care-connectors.tsx")).toContain("usePermissions");
    expect(read("src/components/care/care-reports.tsx")).toMatch(/usePermissions|canManageSupport|canGenerateAi/);
  });
});
