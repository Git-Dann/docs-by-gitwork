// Storage for Pulse findings (src/server/pulse-findings.ts), against an in-memory database.

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  scan: null as null | Record<string, unknown>,
  states: [] as Record<string, unknown>[],
  tasks: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pulseScan: { findUnique: async () => db.scan },
    pulseFindingState: {
      findMany: async ({ where }: { where: { targetKey: string } }) => db.states.filter((s) => s.targetKey === where.targetKey),
      upsert: async ({ where, create, update }: { where: { workspaceId_targetKey_checkKey: { targetKey: string; checkKey: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const k = where.workspaceId_targetKey_checkKey;
        const i = db.states.findIndex((s) => s.targetKey === k.targetKey && s.checkKey === k.checkKey);
        if (i >= 0) db.states[i] = { ...db.states[i], ...update };
        else db.states.push({ ...create });
      },
    },
    task: {
      findMany: async ({ where }: { where: { id?: { in: string[] }; clientId?: string } }) =>
        where.id ? db.tasks.filter((t) => where.id!.in.includes(t.id as string)) : db.tasks.filter((t) => t.clientId === where.clientId),
    },
    user: { findMany: async () => [{ id: "u1", name: "Dan", email: "d@x" }] },
  },
}));
vi.mock("@/server/tasks", () => ({
  createTask: async (_u: unknown, input: Record<string, unknown>) => {
    const t = { id: `t${db.tasks.length + 1}`, status: "TODO", title: input.title, clientId: input.clientId, metadata: input.metadata, assignees: [] };
    db.tasks.push(t);
    db.created.push(input);
    return t;
  },
}));

import { getFindingStates, sendFindingToBoard, setFindingDecision } from "@/server/pulse-findings";

const user = { id: "u1", role: "ADMIN" } as unknown as Parameters<typeof sendFindingToBoard>[0];

function scan(id: string, clientId: string | null = "c1") {
  return {
    id, workspaceId: "ws", clientId, inputUrl: "https://www.example.com/", inputGithubRepo: null, projectName: "x",
    checks: [{ checkKey: "csp_header", label: "Content-Security-Policy", category: "Security", status: "FAIL", detail: "none", evidence: null }],
  };
}

describe("finding storage", () => {
  beforeEach(() => {
    db.scan = scan("s1");
    db.states = [];
    db.tasks = [];
    db.created = [];
  });

  it("a decision made on one scan is read back for the next scan of the same project", async () => {
    await setFindingDecision(user, "s1", "csp_header", "ACCEPTED_RISK", "internal tool only");
    db.scan = { ...scan("s2"), inputUrl: "https://example.com" }; // same site, different spelling
    const { states } = await getFindingStates("s2");
    expect(states).toEqual([expect.objectContaining({ checkKey: "csp_header", decision: "ACCEPTED_RISK", note: "internal tool only", decidedByName: "Dan" })]);
  });

  it("reopening clears the decision and its note", async () => {
    await setFindingDecision(user, "s1", "csp_header", "FALSE_POSITIVE", "wrong");
    await setFindingDecision(user, "s1", "csp_header", null, "ignored");
    const { states } = await getFindingStates("s1");
    expect(states[0]).toMatchObject({ decision: null, note: null });
  });

  it("refuses a check the scan does not have", async () => {
    await expect(setFindingDecision(user, "s1", "not_a_check", "ACCEPTED_RISK", null)).rejects.toThrow(/not part of this scan/);
  });

  it("sending to the board is idempotent: a second send returns the same task", async () => {
    const first = await sendFindingToBoard(user, "s1", "csp_header");
    const second = await sendFindingToBoard(user, "s1", "csp_header");
    expect(first.created).toBe(true);
    expect(second).toEqual({ taskId: first.taskId, created: false });
    expect(db.created).toHaveLength(1);
    expect(db.created[0]).toMatchObject({ clientId: "c1", title: "[Pulse] Content-Security-Policy", priority: "HIGH" });
  });

  it("a scan with no client has no board, and says so", async () => {
    db.scan = scan("s1", null);
    await expect(sendFindingToBoard(user, "s1", "csp_header")).rejects.toThrow(/Link this scan to a client/);
  });

  it("a task made with the older '+ Task' button counts as on the board", async () => {
    db.tasks.push({ id: "old", status: "DOING", title: "[Pulse] CSP", clientId: "c1", metadata: { source: "pulse_scan", pulseCheckKey: "csp_header" }, assignees: [] });
    const { states, tasks } = await getFindingStates("s1");
    expect(states).toEqual([expect.objectContaining({ checkKey: "csp_header", taskId: "old" })]);
    expect(tasks.map((t) => t.id)).toEqual(["old"]);
    expect((await sendFindingToBoard(user, "s1", "csp_header")).created).toBe(false);
  });

  it("a task deleted from the board no longer counts as on it", async () => {
    db.states.push({ workspaceId: "ws", targetKey: "url:example.com", checkKey: "csp_header", taskId: "gone", decision: null });
    const { states } = await getFindingStates("s1");
    expect(states[0].taskId).toBeNull();
  });
});
