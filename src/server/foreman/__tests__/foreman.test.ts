import { describe, it, expect } from "vitest";
import {
  detectFindings,
  countDevelopers,
  type RawClient,
  type RawTask,
  type RawBlock,
  type RawMilestone,
  type WorkspaceScanData,
} from "../scan";
import { recommendationFor } from "../recommend";
import { resolveForemanConfig } from "../config";
import { FOREMAN_DEFAULTS, sortFindings, type FindingKind, type ForemanFinding } from "../types";

const NOW = new Date("2026-07-15T00:00:00Z");
const DAY = 86_400_000;
const CONFIG = FOREMAN_DEFAULTS; // dueSoonDays 3, criticalOverdue 5, staleDoingDays 5

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY);
}
function inDays(n: number): Date {
  return new Date(NOW.getTime() + n * DAY);
}
function client(id: string, name = id): RawClient {
  return { id, name, slug: name.toLowerCase() };
}
function task(o: Partial<RawTask> & { clientId: string }): RawTask {
  return { id: `t-${Math.random()}`, title: "Task", status: "TODO", dueDate: null, startedAt: null, assignees: [], ...o };
}
function block(o: Partial<RawBlock> & { clientId: string }): RawBlock {
  return { id: `b-${Math.random()}`, name: "Block", startDate: null, endDate: null, taskTotal: 0, taskDone: 0, ...o };
}
function milestone(o: Partial<RawMilestone> & { clientId: string }): RawMilestone {
  return { id: `m-${Math.random()}`, name: "Milestone", date: NOW, ...o };
}
function data(p: Partial<WorkspaceScanData>): WorkspaceScanData {
  return { clients: [], tasks: [], blocks: [], milestones: [], ...p };
}
function byKind(findings: ReturnType<typeof detectFindings>): Map<FindingKind, (typeof findings)[number]> {
  const m = new Map<FindingKind, (typeof findings)[number]>();
  for (const f of findings) if (!m.has(f.kind)) m.set(f.kind, f);
  return m;
}

describe("resolveForemanConfig", () => {
  it("returns defaults for empty/garbage input", () => {
    expect(resolveForemanConfig(null)).toEqual(FOREMAN_DEFAULTS);
    expect(resolveForemanConfig({ dueSoonDays: "nope" })).toEqual(FOREMAN_DEFAULTS);
  });
  it("clamps out-of-range numbers and keeps valid overrides", () => {
    const c = resolveForemanConfig({ dueSoonDays: 999, criticalOverdue: 0, staleDoingDays: 7, enabled: false });
    expect(c.dueSoonDays).toBe(30); // clamped to max
    expect(c.criticalOverdue).toBe(1); // clamped to min
    expect(c.staleDoingDays).toBe(7);
    expect(c.enabled).toBe(false);
  });
});

describe("detectFindings — overdue tasks", () => {
  it("flags overdue open tasks as warn, escalates to critical past the threshold", () => {
    const warn = detectFindings(
      data({
        clients: [client("c1", "Acme")],
        tasks: [
          task({ clientId: "c1", dueDate: daysAgo(3) }),
          task({ clientId: "c1", dueDate: daysAgo(1) }),
        ],
      }),
      CONFIG,
      NOW,
    );
    const f = byKind(warn).get("OVERDUE_TASKS")!;
    expect(f).toBeDefined();
    expect(f.severity).toBe("warn");
    expect(f.metric).toBe(2);

    const critical = detectFindings(
      data({
        clients: [client("c1", "Acme")],
        tasks: Array.from({ length: 5 }, () => task({ clientId: "c1", dueDate: daysAgo(2) })),
      }),
      CONFIG,
      NOW,
    );
    expect(byKind(critical).get("OVERDUE_TASKS")!.severity).toBe("critical");
  });

  it("NEVER flags a task with no due date, and never flags DONE-only/empty clients", () => {
    const findings = detectFindings(
      data({
        clients: [client("c1", "Acme"), client("c2", "Empty")],
        tasks: [task({ clientId: "c1", dueDate: null })], // undated → not overdue
      }),
      CONFIG,
      NOW,
    );
    expect(findings.find((f) => f.kind === "OVERDUE_TASKS")).toBeUndefined();
    // c2 has nothing at all → no findings for it
    expect(findings.every((f) => f.subjectLabel !== "Empty")).toBe(true);
  });
});

describe("detectFindings — feature blocks", () => {
  it("flags a dated block past its end date with work outstanding", () => {
    const findings = detectFindings(
      data({
        clients: [client("c1", "Acme")],
        blocks: [block({ clientId: "c1", startDate: daysAgo(30), endDate: daysAgo(10), taskTotal: 4, taskDone: 1 })],
      }),
      CONFIG,
      NOW,
    );
    const f = byKind(findings).get("BLOCK_SLIPPING")!;
    expect(f.severity).toBe("critical"); // 10 days slip ≥ 7
    expect(f.metric).toBe(10);
  });

  it("does NOT flag a completed block, an undated block, or a block with no tasks", () => {
    const findings = detectFindings(
      data({
        clients: [client("c1", "Acme")],
        tasks: [task({ clientId: "c1", dueDate: daysAgo(1) })], // keep client non-empty
        blocks: [
          block({ clientId: "c1", startDate: daysAgo(30), endDate: daysAgo(10), taskTotal: 3, taskDone: 3 }), // done
          block({ clientId: "c1", startDate: null, endDate: null, taskTotal: 4, taskDone: 0 }), // undated
          block({ clientId: "c1", startDate: daysAgo(30), endDate: daysAgo(10), taskTotal: 0, taskDone: 0 }), // no tasks
        ],
      }),
      CONFIG,
      NOW,
    );
    expect(findings.find((f) => f.kind === "BLOCK_SLIPPING")).toBeUndefined();
    // the undated block should surface as a blind spot, not a risk
    expect(findings.find((f) => f.kind === "BLOCK_NO_DATES")).toBeDefined();
  });
});

describe("detectFindings — milestones", () => {
  it("flags a missed milestone only when work is outstanding", () => {
    const withWork = detectFindings(
      data({
        clients: [client("c1", "Acme")],
        tasks: [task({ clientId: "c1", dueDate: inDays(30) })], // open work exists
        milestones: [milestone({ clientId: "c1", date: daysAgo(8) })],
      }),
      CONFIG,
      NOW,
    );
    expect(byKind(withWork).get("MILESTONE_MISSED")!.severity).toBe("critical");

    const noWork = detectFindings(
      data({ clients: [client("c1", "Acme")], milestones: [milestone({ clientId: "c1", date: daysAgo(8) })] }),
      CONFIG,
      NOW,
    );
    expect(noWork.find((f) => f.kind === "MILESTONE_MISSED")).toBeUndefined();
  });

  it("flags an imminent milestone within the due-soon horizon", () => {
    const findings = detectFindings(
      data({
        clients: [client("c1", "Acme")],
        tasks: [task({ clientId: "c1", dueDate: inDays(30) })],
        milestones: [milestone({ clientId: "c1", date: inDays(2) })],
      }),
      CONFIG,
      NOW,
    );
    expect(byKind(findings).get("MILESTONE_IMMINENT")).toBeDefined();
  });
});

describe("detectFindings — due-soon cluster + unassigned", () => {
  it("flags a burst of due-soon tasks and unowned time-critical work", () => {
    const findings = detectFindings(
      data({
        clients: [client("c1", "Acme")],
        tasks: [
          task({ clientId: "c1", dueDate: inDays(1) }),
          task({ clientId: "c1", dueDate: inDays(2) }),
          task({ clientId: "c1", dueDate: inDays(2) }),
        ],
      }),
      CONFIG,
      NOW,
    );
    expect(byKind(findings).get("DUE_SOON_CLUSTER")!.metric).toBe(3);
    // all three are unassigned and due soon → UNASSIGNED_WORK (info, none overdue)
    const unassigned = byKind(findings).get("UNASSIGNED_WORK")!;
    expect(unassigned.severity).toBe("info");
  });
});

describe("detectFindings — blind spots (the anti-false-flag discipline)", () => {
  it("reports NO_TIMELINE and NO_DUE_DATES as info, not risks", () => {
    const findings = detectFindings(
      data({
        clients: [client("c1", "Acme")],
        tasks: [
          task({ clientId: "c1", dueDate: null }),
          task({ clientId: "c1", dueDate: null }),
          task({ clientId: "c1", dueDate: null }),
        ],
      }),
      CONFIG,
      NOW,
    );
    const kinds = byKind(findings);
    expect(kinds.get("NO_TIMELINE")!.severity).toBe("info");
    expect(kinds.get("NO_DUE_DATES")!.severity).toBe("info");
    // nothing here should be a risk
    expect(findings.every((f) => f.severity === "info")).toBe(true);
  });
});

describe("detectFindings — developers", () => {
  it("attributes overdue tasks to the assignee and flags overload across clients", () => {
    const alice = { id: "u1", name: "Alice" };
    const findings = detectFindings(
      data({
        clients: [client("c1"), client("c2"), client("c3"), client("c4")],
        tasks: [
          task({ clientId: "c1", dueDate: daysAgo(2), assignees: [alice] }),
          task({ clientId: "c2", dueDate: daysAgo(1), assignees: [alice] }),
          task({ clientId: "c3", dueDate: inDays(5), assignees: [alice] }),
          task({ clientId: "c4", dueDate: inDays(5), assignees: [alice] }),
        ],
      }),
      CONFIG,
      NOW,
    );
    const overdue = byKind(findings).get("DEV_OVERDUE")!;
    expect(overdue.subjectLabel).toBe("Alice");
    expect(overdue.metric).toBe(2);
    expect(byKind(findings).get("DEV_OVERLOADED")!.metric).toBe(4); // 4 open tasks across 4 clients
  });

  it("flags a stalled in-progress task and counts developers", () => {
    const bob = { id: "u2", name: "Bob" };
    const d = data({
      clients: [client("c1")],
      tasks: [task({ clientId: "c1", status: "DOING", startedAt: daysAgo(8), assignees: [bob] })],
    });
    expect(byKind(detectFindings(d, CONFIG, NOW)).get("DEV_STALLED")).toBeDefined();
    expect(countDevelopers(d)).toBe(1);
  });
});

describe("recommendationFor", () => {
  it("returns a non-empty recommendation for every finding kind", () => {
    const kinds: FindingKind[] = [
      "OVERDUE_TASKS",
      "BLOCK_SLIPPING",
      "MILESTONE_MISSED",
      "MILESTONE_IMMINENT",
      "DUE_SOON_CLUSTER",
      "UNASSIGNED_WORK",
      "DEV_OVERDUE",
      "DEV_STALLED",
      "DEV_OVERLOADED",
      "NO_TIMELINE",
      "NO_DUE_DATES",
      "BLOCK_NO_DATES",
    ];
    for (const k of kinds) {
      const r = recommendationFor(k, { clientLabel: "Acme", devLabel: "Alice", count: 3, blockName: "Auth", progressPct: 40, milestoneName: "Launch", days: 5, clientCount: 4, dueSoonDays: 3 });
      expect(r.length).toBeGreaterThan(10);
    }
  });
});

describe("sortFindings", () => {
  it("orders critical → warn → info, then by category and metric", () => {
    const f = (severity: ForemanFinding["severity"], metric: number, category: ForemanFinding["category"] = "project"): ForemanFinding => ({
      key: `k${Math.random()}`,
      category,
      kind: "OVERDUE_TASKS",
      severity,
      subjectId: "s",
      subjectLabel: "S",
      headline: "h",
      evidence: [],
      metric,
      recommendation: "r",
      trend: "steady",
      previousMetric: null,
    });
    const sorted = sortFindings([f("info", 1), f("critical", 2), f("warn", 9), f("warn", 3)]);
    expect(sorted.map((x) => x.severity)).toEqual(["critical", "warn", "warn", "info"]);
    expect(sorted[1].metric).toBe(9); // higher metric first within warn
  });
});
