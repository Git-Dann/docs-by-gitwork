/**
 * The course-request auto-import remembers what its classifier DECLINED, so a declined
 * "New Feedback" conversation is not re-fetched and re-classified on every sync forever
 * (CLAUDE.md §53.7's known gap).
 *
 * Four rules, each pinned here:
 *   1. A conversation already declined, with no newer customer message, is skipped.
 *   2. Only a REAL verdict is recorded. No classifier, or a chunk that failed, records
 *      nothing — those must be retried next sync (§53.3: "we could not classify it" is
 *      not "it is not a course request").
 *   3. An operator's explicit selection ignores the seen list.
 *   4. A customer message newer than the verdict re-opens the conversation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const supportFindFirst = vi.fn();
const wcFindUnique = vi.fn();
const wikiFindUnique = vi.fn();
const convoFindMany = vi.fn();
const seenUpsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportClient: { findFirst: (...a: unknown[]) => supportFindFirst(...a) },
    workspaceClient: { findUnique: (...a: unknown[]) => wcFindUnique(...a) },
    clientWiki: { findUnique: (...a: unknown[]) => wikiFindUnique(...a) },
    supportConversation: { findMany: (...a: unknown[]) => convoFindMany(...a) },
    wikiCourseFeedbackSeen: { upsert: (...a: unknown[]) => seenUpsert(...a) },
  },
}));

const addCourseRequest = vi.fn();
vi.mock("@/server/wiki", () => ({
  addCourseRequest: (...a: unknown[]) => addCourseRequest(...a),
}));

const resolveAiConfig = vi.fn();
const completeText = vi.fn();
vi.mock("@/server/ai-provider", () => ({
  resolveAiConfig: (...a: unknown[]) => resolveAiConfig(...a),
  completeText: (...a: unknown[]) => completeText(...a),
  parseJsonObject: (raw: string) => JSON.parse(raw),
}));

import { runCourseFeedbackImport, isSettledAsSeen } from "@/server/wiki-course-feedback";

const SEEN_AT = new Date("2026-10-01T09:00:00Z");

function convo(id: string, body: string, lastInboundAt: Date | null = new Date("2026-09-30T10:00:00Z")) {
  return {
    id,
    customerLabel: "golfer@example.com",
    subject: "New Feedback Received",
    preview: "New Feedback Received",
    receivedAt: new Date("2026-09-30T10:00:00Z"),
    lastInboundAt,
    messages: [{ body }],
  };
}

const NOT_COURSE = convo("c-watch", "Is there a plan to add an Apple Watch app");
const REAL_COURSE = convo("c-wyb", "Please add Wyboston Lakes Golf course, it's missing.");

/** The classifier answers per index; `results` lists the verdicts for one chunk. */
function classifierSays(results: Array<{ i: number; isCourseRequest: boolean; courseName?: string }>) {
  completeText.mockResolvedValue(JSON.stringify({ results }));
}

function wikiState(seen: Array<{ conversationId: string; seenAt: Date }> = []) {
  wikiFindUnique.mockResolvedValue({ id: "wiki-1", courseRequests: [], courseFeedbackSeen: seen });
}

/** Which conversations reached the classifier, across every call. */
function classifiedText(): string {
  return completeText.mock.calls.map((c) => (c[0] as { user: string }).user).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  supportFindFirst.mockResolvedValue({ id: "support-1", workspaceId: "ws-1" });
  wcFindUnique.mockResolvedValue({ workspaceId: "ws-1", workspace: {} });
  resolveAiConfig.mockReturnValue({ apiKey: "k", provider: "ANTHROPIC", model: "m" });
  seenUpsert.mockResolvedValue({});
  addCourseRequest.mockImplementation((_c: string, d: { courseName: string }) => ({ ...d }));
  wikiState();
});

describe("declined items are remembered", () => {
  it("records a not-a-course-request verdict, then skips it on the next run", async () => {
    convoFindMany.mockResolvedValue([NOT_COURSE]);
    classifierSays([{ i: 0, isCourseRequest: false }]);

    await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(seenUpsert).toHaveBeenCalledTimes(1);
    const args = seenUpsert.mock.calls[0][0] as { create: { conversationId: string; verdict: string } };
    expect(args.create).toMatchObject({ conversationId: "c-watch", verdict: "not_course" });

    // Next sync: the wiki now carries the seen row.
    vi.clearAllMocks();
    supportFindFirst.mockResolvedValue({ id: "support-1", workspaceId: "ws-1" });
    convoFindMany.mockResolvedValue([NOT_COURSE]);
    wikiState([{ conversationId: "c-watch", seenAt: SEEN_AT }]);

    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(completeText).not.toHaveBeenCalled();
    expect(res.scanned).toBe(0);
  });

  it("still classifies the unseen conversations beside a seen one", async () => {
    convoFindMany.mockResolvedValue([NOT_COURSE, REAL_COURSE]);
    wikiState([{ conversationId: "c-watch", seenAt: SEEN_AT }]);
    classifierSays([{ i: 0, isCourseRequest: true, courseName: "Wyboston Lakes Golf" }]);

    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(res.created.map((r) => r.courseName)).toEqual(["Wyboston Lakes Golf"]);
    expect(classifiedText()).not.toContain("Apple Watch");
  });

  it("records a fabricated name as rejected_name, and an absent name as no_named_course", async () => {
    const home = convo("c-home", "My home course has very incorrect information");
    const vague = convo("c-vague", "the scorecard is wrong somewhere");
    convoFindMany.mockResolvedValue([home, vague]);
    classifierSays([
      { i: 0, isCourseRequest: true, courseName: "home course" },
      { i: 1, isCourseRequest: true, courseName: "" },
    ]);

    await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    const recorded = seenUpsert.mock.calls.map((c) => (c[0] as { create: { conversationId: string; verdict: string } }).create);
    expect(recorded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conversationId: "c-home", verdict: "rejected_name" }),
        expect.objectContaining({ conversationId: "c-vague", verdict: "no_named_course" }),
      ]),
    );
    expect(addCourseRequest).not.toHaveBeenCalled();
  });
});

describe("a classifier that did not answer records NOTHING (§53.3)", () => {
  it("no AI key configured → nothing recorded", async () => {
    resolveAiConfig.mockReturnValue({ apiKey: "" });
    convoFindMany.mockResolvedValue([NOT_COURSE]);

    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(res.classifierUnavailable).toBe(true);
    expect(seenUpsert).not.toHaveBeenCalled();
  });

  it("a chunk that threw → nothing recorded", async () => {
    completeText.mockRejectedValue(new Error("404 model retired"));
    convoFindMany.mockResolvedValue([NOT_COURSE]);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(seenUpsert).not.toHaveBeenCalled();
  });

  it("an item the classifier left out of a working batch → not recorded", async () => {
    // One verdict comes back (so the run is "AI used"), but item 1 has none. It is
    // skipped this run, and must be re-classified next run — never remembered.
    convoFindMany.mockResolvedValue([REAL_COURSE, NOT_COURSE]);
    classifierSays([{ i: 0, isCourseRequest: true, courseName: "Wyboston Lakes Golf" }]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    const recordedIds = seenUpsert.mock.calls.map(
      (c) => (c[0] as { create: { conversationId: string } }).create.conversationId,
    );
    expect(recordedIds).not.toContain("c-watch");
  });
});

describe("operator selection and new messages", () => {
  it("an explicit selection ignores the seen list", async () => {
    convoFindMany.mockResolvedValue([NOT_COURSE]);
    wikiState([{ conversationId: "c-watch", seenAt: SEEN_AT }]);
    classifierSays([{ i: 0, isCourseRequest: false }]);

    const res = await runCourseFeedbackImport("wc-1", {
      conversationIds: ["c-watch"],
      onlyCourseRequests: false,
    });
    expect(res.created.length).toBe(1);
  });

  it("a customer message newer than the verdict re-classifies the conversation", async () => {
    const replied = convo(
      "c-watch",
      "Please add Wyboston Lakes Golf course",
      new Date("2026-10-05T12:00:00Z"), // after SEEN_AT
    );
    convoFindMany.mockResolvedValue([replied]);
    wikiState([{ conversationId: "c-watch", seenAt: SEEN_AT }]);
    classifierSays([{ i: 0, isCourseRequest: true, courseName: "Wyboston Lakes Golf" }]);

    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(completeText).toHaveBeenCalled();
    expect(res.created.map((r) => r.courseName)).toEqual(["Wyboston Lakes Golf"]);
  });

  it("isSettledAsSeen", () => {
    expect(isSettledAsSeen(undefined, null)).toBe(false);
    expect(isSettledAsSeen(SEEN_AT, null)).toBe(true);
    expect(isSettledAsSeen(SEEN_AT, new Date("2026-09-01T00:00:00Z"))).toBe(true);
    expect(isSettledAsSeen(SEEN_AT, SEEN_AT)).toBe(true);
    expect(isSettledAsSeen(SEEN_AT, new Date("2026-10-02T00:00:00Z"))).toBe(false);
  });
});
