// The re-examination job, with the database and the scanner mocked at the module edge.
// Each test is one of the rules the feature exists for: dedupe, supersede only on success,
// a failure keeps the old mark, and an issuer who lost permission pauses the schedule.

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  countermarkSchedule: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  countermarkRecheck: { count: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  countermark: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  pulseScan: { findFirst: vi.fn() },
}));
const enqueueJob = vi.hoisted(() => vi.fn());
const issueCountermark = vi.hoisted(() => vi.fn());
const resolveEffectiveUserById = vi.hoisted(() => vi.fn());
const dispatchNotification = vi.hoisted(() => vi.fn());
const createPulseScanRecord = vi.hoisted(() => vi.fn());
const runAnalysis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob }));
vi.mock("@/server/mcp/auth", () => ({ resolveEffectiveUserById }));
vi.mock("@/server/auth/effective-user", () => ({
  canIssueCountermark: (u: { permissions: string[] }) => u.permissions.includes("provenance.issue"),
}));
vi.mock("@/server/notifications", () => ({ dispatchNotification }));
vi.mock("@/server/pulse", () => ({ createPulseScanRecord, runAnalysis }));
vi.mock("../issue", async () => {
  class ProvenanceError extends Error {
    status = 400;
  }
  class ProvenanceNotEstablishedError extends ProvenanceError {
    constructor(
      public grade: string,
      public gradeReason: string,
    ) {
      super("not established");
    }
  }
  return { issueCountermark, ProvenanceError, ProvenanceNotEstablishedError };
});

import { runRecheckJob, startDueRechecks } from "../recheck";
import { ProvenanceNotEstablishedError } from "../issue";

const now = new Date("2026-11-18T09:00:00Z");
const mark = {
  id: "cm1",
  supersededById: null,
  revokedAt: null,
  issuedAt: new Date("2026-08-20T09:00:00Z"),
  expiresAt: new Date("2026-11-30T09:00:00Z"),
  grade: "CERTIFIED",
  subjectName: "Fellas",
  subjectRepo: "acme/fellas",
  subjectUrl: null,
  scanId: "scan-old",
  clientId: "c1",
  standardId: "SAS-1",
};
const schedule = {
  id: "s1",
  workspaceId: "w1",
  subjectName: "Fellas",
  countermarkId: "cm1",
  enabled: true,
  cadenceDays: null,
  enabledById: "u1",
  enabledByName: "Siân",
  nextDueAt: new Date("2026-11-16T09:00:00Z"),
  pausedReason: null,
  failureStreak: 0,
};
const running = {
  id: "r1",
  workspaceId: "w1",
  scheduleId: "s1",
  fromCountermarkId: "cm1",
  scanId: "scan-new",
  status: "running",
  gradeBefore: "CERTIFIED",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.countermark.findFirst.mockResolvedValue(mark);
  db.countermarkSchedule.findUnique.mockResolvedValue(schedule);
  db.countermarkSchedule.update.mockResolvedValue(schedule);
  db.countermarkRecheck.count.mockResolvedValue(0);
  db.countermarkRecheck.create.mockResolvedValue(running);
  db.countermarkRecheck.update.mockResolvedValue(running);
  db.countermarkRecheck.findUnique.mockResolvedValue(running);
  resolveEffectiveUserById.mockResolvedValue({ permissions: ["provenance.issue"] });
  enqueueJob.mockResolvedValue({ id: "j", deduped: false });
});

describe("scheduling", () => {
  it("enqueues one start job per due schedule, deduped on the schedule", async () => {
    db.countermarkSchedule.findMany.mockResolvedValue([{ id: "s1", workspaceId: "w1" }]);
    await startDueRechecks(now);
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "COUNTERMARK_RECHECK",
        payload: { phase: "start", scheduleId: "s1" },
        dedupeKey: "countermark-recheck:s1",
      }),
    );
    // Only enabled, unpaused, due schedules are even looked at.
    expect(db.countermarkSchedule.findMany.mock.calls[0][0].where).toEqual({
      enabled: true,
      pausedReason: null,
      nextDueAt: { lte: now },
    });
  });

  it("skips a schedule whose attempt is still running", async () => {
    db.countermarkSchedule.findMany.mockResolvedValue([{ id: "s1", workspaceId: "w1" }]);
    db.countermarkRecheck.count.mockResolvedValue(1);
    await startDueRechecks(now);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("a start that runs early does nothing", async () => {
    db.countermarkSchedule.findUnique.mockResolvedValue({ ...schedule, nextDueAt: new Date("2026-12-01T00:00:00Z") });
    const out = await runRecheckJob({ phase: "start", scheduleId: "s1" }, now);
    expect(out).toMatchObject({ started: false, why: "not due" });
    expect(createPulseScanRecord).not.toHaveBeenCalled();
  });

  it("a due start begins a scan of the same subject and hands off to a poll, without waiting", async () => {
    db.pulseScan.findFirst.mockResolvedValue({
      inputType: "GITHUB_REPO",
      inputUrl: null,
      inputGithubRepo: "acme/fellas",
      inputDescription: null,
      platform: "IOS_APP",
      clientId: "c1",
      targetMarkets: ["UK"],
    });
    createPulseScanRecord.mockResolvedValue({ scan: { id: "scan-new" }, aiConfig: {} });
    runAnalysis.mockReturnValue(new Promise(() => {})); // never resolves: must not be awaited
    const out = await runRecheckJob({ phase: "start", scheduleId: "s1" }, now);
    expect(out).toMatchObject({ started: true, scanId: "scan-new" });
    expect(createPulseScanRecord).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1", inputGithubRepo: "acme/fellas", inputType: "GITHUB_REPO" }),
    );
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { phase: "poll", recheckId: "r1", polls: 0 } }),
    );
  });
});

describe("supersede only on success", () => {
  it("a completed scan strikes a successor that supersedes the old mark", async () => {
    db.pulseScan.findFirst.mockResolvedValue({ status: "COMPLETED", errorMessage: null });
    issueCountermark.mockResolvedValue({
      id: "cm2",
      grade: "CONDITIONAL",
      gradeReason: "A warning",
      clientId: "c1",
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    });
    const out = await runRecheckJob({ phase: "poll", recheckId: "r1", polls: 2 }, now);
    expect(out).toMatchObject({ outcome: "issued", countermarkId: "cm2" });
    expect(issueCountermark).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: "scan-new", supersedesId: "cm1", requireEstablished: true, issuerName: "Siân" }),
    );
    // A grade change is worth a notification.
    expect(dispatchNotification).toHaveBeenCalledWith(expect.objectContaining({ event: "provenance.recheck" }));
  });

  it("a scan still running re-enqueues a later poll and strikes nothing", async () => {
    db.pulseScan.findFirst.mockResolvedValue({ status: "RUNNING", errorMessage: null });
    await runRecheckJob({ phase: "poll", recheckId: "r1", polls: 2 }, now);
    expect(issueCountermark).not.toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { phase: "poll", recheckId: "r1", polls: 3 } }),
    );
  });
});

describe("a failure keeps the old mark", () => {
  it("a failed scan records the attempt and never touches a countermark", async () => {
    db.pulseScan.findFirst.mockResolvedValue({ status: "FAILED", errorMessage: "clone failed" });
    const out = await runRecheckJob({ phase: "poll", recheckId: "r1", polls: 2 }, now);
    expect(out).toMatchObject({ outcome: "failed" });
    expect(issueCountermark).not.toHaveBeenCalled();
    expect(db.countermark.update).not.toHaveBeenCalled();
    expect(db.countermark.updateMany).not.toHaveBeenCalled();
    expect(db.countermarkRecheck.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed", reason: expect.stringContaining("clone failed") }) }),
    );
    expect(dispatchNotification).toHaveBeenCalled();
  });

  it("an examination that can't establish a grade keeps the old mark", async () => {
    db.pulseScan.findFirst.mockResolvedValue({ status: "COMPLETED", errorMessage: null });
    issueCountermark.mockRejectedValue(new ProvenanceNotEstablishedError("INCOMPLETE", "C11 could not be read"));
    const out = await runRecheckJob({ phase: "poll", recheckId: "r1", polls: 2 }, now);
    expect(out).toMatchObject({ outcome: "not_established" });
    expect(db.countermarkSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureStreak: { increment: 1 } }) }),
    );
    expect(db.countermarkSchedule.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ countermarkId: expect.anything() }) }),
    );
  });
});

describe("permission pause", () => {
  it("an issuer who lost provenance.issue pauses the schedule before a scan is spent", async () => {
    resolveEffectiveUserById.mockResolvedValue({ permissions: [] });
    const out = await runRecheckJob({ phase: "start", scheduleId: "s1" }, now);
    expect(out).toMatchObject({ started: false, why: "paused" });
    expect(createPulseScanRecord).not.toHaveBeenCalled();
    expect(db.countermarkSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pausedReason: expect.stringContaining("can no longer issue") } }),
    );
  });

  it("an issuer archived while the scan ran: nothing is struck in their name", async () => {
    db.pulseScan.findFirst.mockResolvedValue({ status: "COMPLETED", errorMessage: null });
    resolveEffectiveUserById.mockResolvedValue(null);
    const out = await runRecheckJob({ phase: "poll", recheckId: "r1", polls: 2 }, now);
    expect(out).toMatchObject({ outcome: "paused" });
    expect(issueCountermark).not.toHaveBeenCalled();
  });
});
