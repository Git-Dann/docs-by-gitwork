/**
 * One "% complete" for a project, wherever it is printed. The same project used to read 41%
 * on the wiki Timeline (an average of the phase bars) and 29% on Delivery, RoundUp and the
 * dashboard (tasks done ÷ tasks). These tests pin the rule and fail if a surface goes back
 * to its own maths.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectProgress, summariseDelivery, type DeliveryBlock } from "@/lib/wiki-delivery";

const done = (n: number) => Array.from({ length: n }, () => ({ done: true }));
const open = (n: number) => Array.from({ length: n }, () => ({ done: false }));

// One small finished phase and one big untouched one: the average of the bars is 50%,
// the honest figure is 1 task of 41.
const lopsided: DeliveryBlock[] = [
  { id: "a", name: "Kick-off", progress: 100, tasks: done(1) },
  { id: "b", name: "Build", progress: 0, tasks: open(40) },
];

describe("projectProgress — the one rule", () => {
  it("counts tasks, not phases", () => {
    expect(projectProgress({ blocks: lopsided })).toEqual({ done: 1, total: 41, percent: 2 });
  });

  it("counts loose work on no phase", () => {
    expect(projectProgress({ blocks: lopsided, unassigned: [...done(9), ...open(10)] }).percent).toBe(17);
  });

  it("prefers statusCounts over the coarser task list", () => {
    const b: DeliveryBlock = { id: "c", name: "QA", progress: 0, statusCounts: { DONE: 3, DOING: 1 }, tasks: open(4) };
    expect(projectProgress({ blocks: [b] }).percent).toBe(75);
  });

  it("is null, never 0% or 100%, when there is nothing to count", () => {
    expect(projectProgress({ blocks: [] }).percent).toBeNull();
    // A phase drawn on the Gantt but not broken down yet. Averaging its bar would say 0%,
    // dividing by zero would say 100%; neither is true.
    expect(projectProgress({ blocks: [{ id: "d", name: "Later", progress: 0, tasks: [] }] }).percent).toBeNull();
  });

  it("is exactly what Delivery reports", () => {
    const unassigned = [...done(2), ...open(3)];
    const d = summariseDelivery({ blocks: lopsided, milestones: [], blockers: [], unassigned });
    const p = projectProgress({ blocks: lopsided, unassigned });
    expect({ done: d.done, total: d.total, percent: d.percent }).toEqual(p);
  });
});

// ── Every surface that prints a project's % complete goes through the rule ───────────

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const SURFACES: Record<string, RegExp> = {
  // Wiki Timeline header
  "src/components/clients/wiki/wiki-timeline-section.tsx": /projectProgress\(/,
  // Wiki dashboard: the timeline tile's figure and the Delivery tile
  "src/components/clients/wiki/wiki-dashboard.tsx": /projectProgress\(/,
  // Delivery and RoundUp pages read summariseDelivery, which reads projectProgress
  "src/components/clients/wiki/wiki-delivery-section.tsx": /summariseDelivery\(/,
  "src/components/clients/wiki/wiki-roundup-section.tsx": /summariseDelivery\(/,
  // The public /timeline/[token] share, computed server-side
  "src/server/client-timeline.ts": /projectProgress\(/,
};

describe("every % complete surface uses the rule", () => {
  for (const [file, pattern] of Object.entries(SURFACES)) {
    it(file, () => {
      expect(read(file)).toMatch(pattern);
    });
  }

  it("Delivery's own overall figure comes from projectProgress", () => {
    const src = read("src/lib/wiki-delivery.ts");
    const body = src.slice(src.indexOf("export function summariseDelivery("));
    expect(body).toMatch(/projectProgress\(\{ blocks, unassigned: input\.unassigned \}\)/);
  });

  it("the dashboard Delivery tile counts loose work, as the Delivery page does", () => {
    const src = read("src/components/clients/wiki/wiki-dashboard.tsx");
    const tile = src.slice(src.indexOf('case "delivery":'), src.indexOf('case "support":'));
    expect(tile).toMatch(/unassigned: wiki\.timeline\.unassigned/);
  });

  it("nothing averages the phase bars into a project figure", () => {
    // `reduce((sum, b) => sum + b.progress, 0) / blocks.length` is the exact shape that
    // produced 41% vs 29%. A per-phase bar may still use `progress`; a project figure may not.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "node_modules" || name === "__tests__") continue;
          walk(p);
        } else if (/\.tsx?$/.test(name)) {
          const text = readFileSync(p, "utf8");
          if (/\.progress,\s*0\)\s*\/\s*[a-zA-Z.]+\.length/.test(text)) offenders.push(p.slice(ROOT.length + 1));
        }
      }
    };
    // Where a project figure can be printed. Walking all of src/ is slow enough to time out
    // under a parallel test run.
    for (const dir of ["src/components/clients", "src/components/tasks", "src/lib", "src/server", "src/app/timeline"]) {
      walk(join(ROOT, dir));
    }
    expect(offenders).toEqual([]);
  }, 30_000);
});
