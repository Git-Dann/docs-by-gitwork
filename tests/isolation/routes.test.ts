/**
 * Two businesses must never see or change each other's data.
 *
 * Every API route is called as a Super Admin of one business, with the other business's ids in
 * its path, in both directions. A response containing the other business's marker is a LEAK; a
 * write that changes the other business's rows is WROTE. See docs/build-checklist.md §4b.
 *
 * Today's code still serves the Gitwork workspace to everyone (Phase 2.2b changes that), so some
 * routes leak. `known-leaks.json` records exactly which. This test fails when:
 *   - a route leaks that is NOT on the list (a new leak), or
 *   - a listed leak no longer happens (the list must shrink with the fix: rerun with
 *     ISOLATION_UPDATE=1 and commit the file).
 * An empty list is the gate before any other business can sign in.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedBoth, snapshotSide } from "./fixtures";
import { call, discoverRoutes, judge, keyOf, plan, type Outcome, type Verdict } from "./harness";

const KNOWN_FILE = join(__dirname, "known-leaks.json");
const REPORT_FILE = join(__dirname, ".report.md");
const UPDATE = process.env.ISOLATION_UPDATE === "1";
const UNCOVERED_CEILING = 58;

type Known = { leaks: string[]; writes: string[] };

const outcomes: Outcome[] = [];

beforeAll(async () => {
  await seedBoth(prisma);
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("two businesses are isolated", () => {
  const routes = discoverRoutes();

  it("finds the API routes (a broken walker would report zero leaks)", () => {
    expect(routes.length).toBeGreaterThan(500);
    expect(routes.some((r) => r.pattern === "/api/tasks/[id]")).toBe(true);
    expect(routes.some((r) => r.pattern === "/api/documents/[id]")).toBe(true);
  });

  it("calls every route in both directions", async () => {
    for (const attacker of ["b", "a"] as const) {
      for (const p of plan(routes, attacker)) {
        const before = p.method === "GET" ? null : await snapshotSide(prisma, p.victim);
        const res = await call(p);
        const after = before === null ? null : await snapshotSide(prisma, p.victim);
        const wrote = before !== null && before !== after;
        const verdict = judge(p, res, wrote);
        outcomes.push({ ...p, status: res.status, verdict, wrote, note: (res.error ?? ((res.status ?? 0) >= 500 ? res.body : ""))?.slice(0, 200) || undefined });
        // A write that crossed leaves the fixture changed; reseed so the next call starts clean.
        if (wrote) await seedBoth(prisma);
      }
    }
    expect(outcomes.length).toBeGreaterThan(800);
    // A call whose path couldn't be filled proves nothing. Fill more segments in harness.ts
    // (fill / ID_BY_PARENT) and lower this; it must never rise.
    expect(outcomes.filter((o) => o.verdict === "uncovered").length).toBeLessThanOrEqual(UNCOVERED_CEILING);
  }, 1_800_000);

  it("leaks nothing beyond the known list, and the list holds nothing already fixed", () => {
    const leaks = [...new Set(outcomes.filter((o) => o.verdict === "LEAK").map(keyOf))].sort();
    const writes = [...new Set(outcomes.filter((o) => o.wrote).map(keyOf))].sort();
    writeReport(outcomes);

    if (UPDATE || !existsSync(KNOWN_FILE)) {
      writeFileSync(KNOWN_FILE, JSON.stringify({ leaks, writes } satisfies Known, null, 2) + "\n");
      return;
    }
    const known = JSON.parse(readFileSync(KNOWN_FILE, "utf8")) as Known;
    const newLeaks = leaks.filter((k) => !known.leaks.includes(k));
    const newWrites = writes.filter((k) => !known.writes.includes(k));
    const fixedLeaks = known.leaks.filter((k) => !leaks.includes(k));
    const fixedWrites = known.writes.filter((k) => !writes.includes(k));

    expect(newLeaks, "NEW cross-business reads. Fix the route; never add these to the list.").toEqual([]);
    expect(newWrites, "NEW cross-business writes. Fix the route; never add these to the list.").toEqual([]);
    expect(
      [...fixedLeaks, ...fixedWrites],
      "These no longer cross. Good: rerun with ISOLATION_UPDATE=1 and commit known-leaks.json.",
    ).toEqual([]);
  });
});

function writeReport(all: Outcome[]) {
  const count = (v: Verdict) => all.filter((o) => o.verdict === v).length;
  const verdicts: Verdict[] = ["LEAK", "WROTE", "refused", "rejected", "isolated", "error", "uncovered"];
  const lines = [
    "# Isolation report",
    "",
    `${all.length} calls across ${new Set(all.map((o) => o.route.pattern)).size} routes.`,
    "",
    "| Verdict | Calls |",
    "|---|---|",
    ...verdicts.map((v) => `| ${v} | ${count(v)} |`),
    "",
  ];
  for (const v of ["LEAK", "WROTE", "error", "uncovered"] as const) {
    const rows = all.filter((o) => o.verdict === v);
    if (rows.length === 0) continue;
    lines.push(`## ${v}`, "");
    for (const o of rows) lines.push(`- \`${keyOf(o)}\` (${o.status ?? "threw"})${o.note ? ` — ${o.note.replace(/\n/g, " ")}` : ""}`);
    lines.push("");
  }
  writeFileSync(REPORT_FILE, lines.join("\n"));
  const summary = verdicts.map((v) => `${v} ${count(v)}`).join(" · ");
  process.stdout.write(`\n[isolation] ${all.length} calls — ${summary}\n[isolation] report: ${REPORT_FILE}\n`);
}
