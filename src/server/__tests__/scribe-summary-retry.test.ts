/**
 * Scribe: a failed AI summary is recorded as a summary failure with a plain reason, Retry
 * summarises the stored notes without reading Drive, and the cron retries failures it would
 * otherwise never revisit (CLAUDE.md §14).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({ meetings: [] as Row[] }));
const ai = vi.hoisted(() => ({ complete: vi.fn(), key: "sk-test" as string | null }));
const drive = vi.hoisted(() => ({ find: vi.fn() }));

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ("not" in o) return row[k] !== o.not;
      if ("lt" in o) return (row[k] as number) < (o.lt as number);
      if ("in" in o) return (o.in as unknown[]).includes(row[k]);
      return true;
    }
    return row[k] === v;
  });
}
function apply(row: Row, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as object)) row[k] = ((row[k] as number) ?? 0) + (v as { increment: number }).increment;
    else row[k] = v;
  }
}

vi.mock("@/lib/prisma", () => {
  const meeting = {
    findUnique: async ({ where }: { where: { id: string } }) => db.meetings.find((m) => m.id === where.id) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => db.meetings.find((m) => matches(m, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => db.meetings.filter((m) => matches(m, where)),
    count: async ({ where }: { where: Record<string, unknown> }) => db.meetings.filter((m) => matches(m, where)).length,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = db.meetings.find((m) => m.id === where.id)!;
      apply(row, data);
      return row;
    },
    upsert: async ({ where, create, update }: { where: { workspaceId_calendarEventId: { calendarEventId: string } }; create: Row; update: Record<string, unknown> }) => {
      const row = db.meetings.find((m) => m.calendarEventId === where.workspaceId_calendarEventId.calendarEventId);
      if (row) {
        apply(row, update);
        return row;
      }
      const created = { ...create, id: `m${db.meetings.length + 1}` } as Row;
      db.meetings.push(created);
      return created;
    },
  };
  return {
    prisma: {
      meeting,
      workspace: { findUnique: async () => ({ aiProvider: "ANTHROPIC" }) },
      meetingActionItem: { deleteMany: async () => ({}), createMany: async () => ({}) },
      user: { findMany: async () => [] },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    },
  };
});
vi.mock("@/server/ai-provider", () => ({
  resolveAiConfig: () => ({ provider: "ANTHROPIC", apiKey: ai.key, model: "m", baseUrl: null }),
  completeText: (...a: unknown[]) => ai.complete(...a),
  parseJsonObject: (raw: string) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
}));
vi.mock("@/server/google-drive-notes", () => ({
  findGeminiNotesForEvent: (...a: unknown[]) => drive.find(...a),
  extractMeetingCode: (c: string) => c,
}));
vi.mock("@/server/notifications", () => ({ dispatchNotification: async () => undefined }));

import { ingestMeeting, resummariseStoredNotes, retryFailedSummaries, summariseMeeting } from "../meetings";

const GOOD = JSON.stringify({ summary: "We agreed the plan.", decisions: [], actionItems: [] });
const CREDIT = new Error('400 {"type":"error","error":{"message":"Your credit balance is too low"}}');

function stored(over: Partial<Row> = {}): Row {
  return {
    id: "m1",
    workspaceId: "w",
    clientId: "c",
    calendarEventId: "ev1",
    title: "Luke x Dan",
    transcriptText: "Notes by Gemini: …",
    attendees: [],
    status: "ERROR",
    summaryError: null,
    summaryAttempts: 0,
    summaryAttemptedAt: null,
    startedAt: new Date("2026-11-18T10:00:00Z"),
    createdAt: new Date("2026-11-18T10:00:00Z"),
    client: null,
    ...over,
  };
}

beforeEach(() => {
  db.meetings = [];
  ai.complete.mockReset();
  ai.key = "sk-test";
  drive.find.mockReset();
});

describe("recording a failed summary", () => {
  it("marks it failed with the reason in words and counts the attempt", async () => {
    db.meetings = [stored({ status: "TRANSCRIBED" })];
    ai.complete.mockRejectedValue(CREDIT);
    await summariseMeeting("m1");
    expect(db.meetings[0]).toMatchObject({ status: "ERROR", summaryAttempts: 1 });
    expect(db.meetings[0].summaryError).toMatch(/out of credit/);
    expect(db.meetings[0].summaryError).not.toContain("{");
  });

  it("says no AI key is set up rather than calling the provider", async () => {
    db.meetings = [stored({ status: "TRANSCRIBED" })];
    ai.key = null;
    await summariseMeeting("m1");
    expect(ai.complete).not.toHaveBeenCalled();
    expect(db.meetings[0].summaryError).toMatch(/No AI provider/);
  });

  it("clears the reason and the count once it succeeds", async () => {
    db.meetings = [stored({ summaryError: "x", summaryAttempts: 3 })];
    ai.complete.mockResolvedValue(GOOD);
    await summariseMeeting("m1");
    expect(db.meetings[0]).toMatchObject({ status: "SUMMARISED", summaryError: null, summaryAttempts: 0 });
  });
});

describe("Retry", () => {
  it("summarises the stored notes without reading Drive", async () => {
    db.meetings = [stored()];
    ai.complete.mockResolvedValue(GOOD);
    const m = await resummariseStoredNotes("w", "c", "ev1");
    expect(m?.status).toBe("SUMMARISED");
    expect(drive.find).not.toHaveBeenCalled();
  });

  it("only for that client's meeting, and only when notes are stored", async () => {
    db.meetings = [stored({ clientId: "other" }), stored({ id: "m2", calendarEventId: "ev2", transcriptText: null })];
    expect(await resummariseStoredNotes("w", "c", "ev1")).toBeNull();
    expect(await resummariseStoredNotes("w", "c", "ev2")).toBeNull();
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it("through the Drive path still summarises stored notes when Drive finds nothing this time", async () => {
    db.meetings = [stored()];
    drive.find.mockResolvedValue(null);
    ai.complete.mockResolvedValue(GOOD);
    await ingestMeeting({
      workspaceId: "w",
      clientId: "c",
      ownerUserId: null,
      client: {} as never,
      calendarEventId: "ev1",
      title: "Luke x Dan",
      meetingCode: "abc",
    });
    expect(db.meetings[0].status).toBe("SUMMARISED");
  });
});

describe("the cron's retry pass", () => {
  it("retries failed summaries, however old, and backs off the ones it just tried", async () => {
    db.meetings = [
      stored({ id: "a", calendarEventId: "a" }),
      stored({ id: "b", calendarEventId: "b", summaryAttempts: 1, summaryAttemptedAt: new Date() }),
      stored({ id: "c", calendarEventId: "c", summaryAttempts: 6 }),
      stored({ id: "d", calendarEventId: "d", status: "SUMMARISED" }),
    ];
    ai.complete.mockResolvedValue(GOOD);
    const r = await retryFailedSummaries("w");
    expect(r).toMatchObject({ due: 1, summarised: 1 });
    expect(db.meetings.find((m) => m.id === "a")!.status).toBe("SUMMARISED");
    expect(db.meetings.find((m) => m.id === "b")!.status).toBe("ERROR");
    expect(db.meetings.find((m) => m.id === "c")!.status).toBe("ERROR");
  });
});
