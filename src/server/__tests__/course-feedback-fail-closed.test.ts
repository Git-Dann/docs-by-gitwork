/**
 * The Wedge course-request auto-import must FAIL CLOSED when its classifier does not run.
 *
 * ## The incident this pins
 *
 * On 16 Sept 2026 a single import run created **389 course requests with an empty
 * `courseName`** on the Wedge client wiki — rendered to the client as "Untitled Course",
 * and reported by them. None of them were course requests: they were ordinary app
 * feedback (handicap questions, "add Apple Watch support", yards-vs-metres).
 *
 * The cause was one line:
 *
 *   const onlyCourse = (opts.onlyCourseRequests ?? !opts.conversationIds?.length) && aiUsed;
 *
 * `aiUsed` is `verdicts.size > 0`. When the AI produced no verdicts — no key, a failed
 * chunk, unparseable JSON — `onlyCourse` went false, which switched off **all three**
 * guards at once: the is-this-a-course-request filter, the require-a-real-name check, and
 * the dedupe. Every scanned email was then written as a nameless course request.
 *
 * It was deliberate ("an AI outage can't silently drop everything — it falls back to
 * importing unfilled") and it was the wrong trade in both directions:
 *   - Nothing is dropped by importing none: the scan re-runs every sync and dedupes on
 *     `sourceConversationId`, so a skipped batch lands whole on the next good run.
 *   - Importing unfilled puts junk in front of the client and leaves a person deleting
 *     rows by hand.
 *
 * ⚠️ This is CLAUDE.md §35's rule one layer out: **a check that could not run must not
 * become a confident assertion.** "We could not classify these" is not "these are all
 * course requests".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const findUnique = vi.fn();
const convoFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportClient: { findFirst: (...a: unknown[]) => findFirst(...a) },
    workspaceClient: { findUnique: (...a: unknown[]) => findUnique(...a) },
    clientWiki: { findUnique: (...a: unknown[]) => findUnique(...a) },
    supportConversation: { findMany: (...a: unknown[]) => convoFindMany(...a) },
  },
}));

const addCourseRequest = vi.fn();
vi.mock("@/server/wiki", () => ({
  addCourseRequest: (...a: unknown[]) => addCourseRequest(...a),
}));

// No AI key configured → `aiExtractCourses` returns zero verdicts, which is exactly the
// state the incident ran in.
vi.mock("@/server/ai-provider", () => ({
  resolveAiConfig: () => ({ apiKey: "" }),
  completeText: vi.fn(),
  parseJsonObject: vi.fn(),
}));

import { runCourseFeedbackImport } from "@/server/wiki-course-feedback";

const FEEDBACK = [
  {
    id: "c1",
    customerLabel: "Big Wedge Golf",
    subject: "New Feedback Received",
    preview: "New Feedback Received",
    receivedAt: new Date("2026-06-19T19:04:53Z"),
    messages: [{ body: "I lost all my game records. Great app otherwise!" }],
  },
  {
    id: "c2",
    customerLabel: "Big Wedge Golf",
    subject: "New Feedback Received",
    preview: "New Feedback Received",
    receivedAt: new Date("2026-06-28T06:37:38Z"),
    messages: [{ body: "Is there a plan to add an Apple Watch app" }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({ id: "support-1", workspaceId: "ws-1" });
  // `clientWiki.findUnique` backs both alreadyImportedIds and existingCourseNames.
  findUnique.mockResolvedValue({ courseRequests: [], workspaceId: "ws-1", workspace: null });
  convoFindMany.mockResolvedValue(FEEDBACK);
  addCourseRequest.mockImplementation((_c: string, d: { courseName: string }) => ({ ...d }));
});

describe("auto import with no classifier", () => {
  it("creates NOTHING rather than importing unclassified feedback", async () => {
    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });

    expect(addCourseRequest).not.toHaveBeenCalled();
    expect(res.created).toEqual([]);
    expect(res.classifierUnavailable).toBe(true);
  });

  it("reports the items as skipped, not as nothing-to-do", async () => {
    // ⚠️ `scanned: 0` would read as "there was no feedback waiting", which is a different
    // and reassuring fact. The run must say it saw work and declined to act on it.
    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(res.scanned).toBe(FEEDBACK.length);
    expect(res.skipped).toBe(FEEDBACK.length);
  });

  it("never writes a course request with an empty name", async () => {
    await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    const names = addCourseRequest.mock.calls.map((c) => (c[1] as { courseName: string }).courseName);
    expect(names.filter((n) => !n.trim())).toEqual([]);
  });

  it("still honours an operator's explicit selection", async () => {
    // A person who ticked specific rows chose them and is about to name them; only the
    // unattended path fails closed.
    const res = await runCourseFeedbackImport("wc-1", {
      conversationIds: ["c1", "c2"],
      onlyCourseRequests: false,
    });
    expect(res.created.length).toBe(2);
    expect(res.classifierUnavailable).toBeUndefined();
  });
});
