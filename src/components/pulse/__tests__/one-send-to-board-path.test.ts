// A Pulse finding reaches a client's board one way: the findings write
// (POST /api/pulse/scans/[id]/findings/task via useSendPulseFindingToBoard), which records a
// PulseFindingState. The by-category view of every check used to build its own task with
// useBatchCreateTasks, so a task made there was invisible to the Findings list's state and
// the two views could disagree. This fails if any Pulse component builds the task itself again.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src/components/pulse");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "__tests__") return [];
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("one send-to-board path for Pulse findings", () => {
  const sources = files(ROOT).map((p) => ({ p, src: readFileSync(p, "utf8") }));

  it("no Pulse component writes a board task for a check by itself", () => {
    const offenders = sources.filter(({ src }) => /useBatchCreateTasks|useCreateTask\b|pulseCheckKey/.test(src)).map(({ p }) => p);
    expect(offenders).toEqual([]);
  });

  it("the by-category view and the Findings list both send through the findings mutation", () => {
    const users = sources.filter(({ src }) => src.includes("useSendPulseFindingToBoard(")).map(({ p }) => p.replace(`${ROOT}/`, ""));
    expect(users).toContain("pulse-findings.tsx");
    expect(users.length).toBeGreaterThanOrEqual(2);
  });
});
