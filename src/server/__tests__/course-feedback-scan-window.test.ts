/**
 * The auto-import's scan cap applies to CANDIDATES, not raw rows.
 *
 * It used to read only the 150 newest "New Feedback" conversations and then drop the
 * ones already imported or already declined. Once those 150 were all settled, every
 * older unseen conversation was unreachable — forever. The scan now pages newest-first
 * until it has 150 candidates. Pinned here:
 *   1. 150 newest all seen → an older unseen conversation is still classified.
 *   2. A seen conversation with a NEWER customer message is still re-classified.
 *   3. Imported conversations are never re-classified, on any page.
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

import { runCourseFeedbackImport } from "@/server/wiki-course-feedback";

const SEEN_AT = new Date("2026-10-01T09:00:00Z");
const BEFORE_SEEN = new Date("2026-09-20T09:00:00Z");
const AFTER_SEEN = new Date("2026-10-05T09:00:00Z");

interface Row {
  id: string;
  customerLabel: string;
  subject: string;
  preview: string;
  receivedAt: Date;
  lastInboundAt: Date | null;
  messages: Array<{ body: string }>;
}

function row(id: string, body: string, minutesAgo: number, lastInboundAt: Date | null = BEFORE_SEEN): Row {
  return {
    id,
    customerLabel: "golfer@example.com",
    subject: "New Feedback Received",
    preview: "New Feedback Received",
    receivedAt: new Date(Date.UTC(2026, 9, 10) - minutesAgo * 60_000),
    lastInboundAt,
    messages: [{ body }],
  };
}

/** A real paging mock: honours skip/take over a newest-first list. */
function inbox(rows: Row[]) {
  convoFindMany.mockImplementation((args: { skip?: number; take?: number }) => {
    const skip = args.skip ?? 0;
    const take = args.take ?? rows.length;
    return Promise.resolve(rows.slice(skip, skip + take));
  });
}

/** 150 newest conversations, all already declined. */
const SETTLED = Array.from({ length: 150 }, (_, i) => row(`settled-${i}`, `Apple Watch idea ${i}`, i));

function classifiedText(): string {
  return completeText.mock.calls.map((c) => (c[0] as { user: string }).user).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  supportFindFirst.mockResolvedValue({ id: "support-1", workspaceId: "ws-1" });
  wcFindUnique.mockResolvedValue({ workspaceId: "ws-1", workspace: {} });
  resolveAiConfig.mockReturnValue({ apiKey: "k", provider: "ANTHROPIC", model: "m" });
  seenUpsert.mockResolvedValue({});
  completeText.mockResolvedValue(JSON.stringify({ results: [] }));
  addCourseRequest.mockImplementation((_c: string, d: { courseName: string }) => ({ ...d }));
});

describe("the scan cap counts candidates, not raw rows", () => {
  it("reaches an older unseen conversation behind 150 newer seen ones", async () => {
    const older = row("older-unseen", "Please add Wyboston Lakes Golf course", 500);
    inbox([...SETTLED, older]);
    wikiFindUnique.mockResolvedValue({
      id: "wiki-1",
      courseRequests: [],
      courseFeedbackSeen: SETTLED.map((r) => ({ conversationId: r.id, seenAt: SEEN_AT })),
    });

    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(res.scanned).toBe(1);
    expect(classifiedText()).toContain("Wyboston Lakes");
    expect(classifiedText()).not.toContain("Apple Watch");
  });

  it("re-classifies a seen conversation whose customer wrote again after the verdict", async () => {
    const reopened = row("reopened", "Sorry — it's Brechin Golf Club", 3, AFTER_SEEN);
    const rows = [...SETTLED.slice(0, 3), reopened, ...SETTLED.slice(3)];
    inbox(rows);
    wikiFindUnique.mockResolvedValue({
      id: "wiki-1",
      courseRequests: [],
      courseFeedbackSeen: rows.map((r) => ({ conversationId: r.id, seenAt: SEEN_AT })),
    });

    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(res.scanned).toBe(1);
    expect(classifiedText()).toContain("Brechin");
  });

  it("never re-classifies an imported conversation, on any page", async () => {
    const importedOld = row("imported-old", "Please add Iver Golf Club", 400);
    const unseenOld = row("unseen-old", "Please add Pendleton Creek course", 600);
    inbox([...SETTLED, importedOld, unseenOld]);
    wikiFindUnique.mockResolvedValue({
      id: "wiki-1",
      courseRequests: [{ sourceConversationId: "imported-old" }],
      courseFeedbackSeen: SETTLED.map((r) => ({ conversationId: r.id, seenAt: SEEN_AT })),
    });

    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(res.scanned).toBe(1);
    expect(classifiedText()).toContain("Pendleton Creek");
    expect(classifiedText()).not.toContain("Iver Golf");
  });

  it("stops paging at the hard cap rather than reading an unbounded inbox", async () => {
    const huge = Array.from({ length: 5000 }, (_, i) => row(`s-${i}`, "noise", i));
    inbox(huge);
    wikiFindUnique.mockResolvedValue({
      id: "wiki-1",
      courseRequests: [],
      courseFeedbackSeen: huge.map((r) => ({ conversationId: r.id, seenAt: SEEN_AT })),
    });

    const res = await runCourseFeedbackImport("wc-1", { onlyCourseRequests: true });
    expect(res.scanned).toBe(0);
    expect(convoFindMany.mock.calls.length).toBeLessThanOrEqual(10);
  });
});
