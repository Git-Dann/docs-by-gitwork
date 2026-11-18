/**
 * How much a client can add to their Board, and how often the team is told
 * (src/server/wiki-board-limit.ts). The thresholds are pure; the database wrappers only count.
 */
import { describe, expect, it, vi } from "vitest";

const counts = vi.hoisted(() => ({
  cards: [0, 0],
  feedback: 0,
  edits: 0,
  uploads: [0, 0],
  sql: [] as string[],
  feedbackWhere: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      counts.sql.push(strings.join("?"));
      return [{ n: BigInt(counts.cards.shift() ?? 0) }];
    }),
    taskClientFeedback: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        // Only the client's own feedback counts: the team's replies (authorUserId set) never do.
        expect(where.authorUserId).toBeNull();
        counts.feedbackWhere.push(where);
        return where.kind === "change" ? counts.edits : counts.feedback;
      }),
    },
    rateLimitHit: {
      count: vi.fn(async ({ where }: { where: { bucket: string } }) => {
        expect(where.bucket).toBe("board:upload:w1");
        return counts.uploads.shift() ?? 0;
      }),
    },
  },
}));

import {
  assertWithinBoardCardQuota,
  assertWithinBoardEditQuota,
  assertWithinBoardFeedbackQuota,
  assertWithinBoardUploadQuota,
  BOARD_QUOTA,
  boardCardQuotaBreach,
  boardEditQuotaBreach,
  boardFeedbackQuotaBreach,
  boardUploadQuotaBreach,
  shouldNotifyBoardCards,
  shouldNotifyCardChange,
} from "../wiki-board-limit";

describe("the board's limits", () => {
  it("allows up to 30 cards an hour and 200 a day", () => {
    expect(BOARD_QUOTA).toMatchObject({ cardsPerHour: 30, cardsPerDay: 200, feedbackPerHour: 60 });
    expect(boardCardQuotaBreach({ hour: 29, day: 199 })).toBeNull();
    expect(boardCardQuotaBreach({ hour: 30, day: 30 })).toMatch(/last hour/);
    expect(boardCardQuotaBreach({ hour: 5, day: 200 })).toMatch(/today/);
  });

  it("allows up to 60 comments an hour", () => {
    expect(boardFeedbackQuotaBreach(59)).toBeNull();
    expect(boardFeedbackQuotaBreach(60)).toMatch(/60 comments/);
  });

  it("tells the team at most once in ten minutes", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(shouldNotifyBoardCards(null, now)).toBe(true);
    expect(shouldNotifyBoardCards(new Date("2026-11-18T11:51:00Z"), now)).toBe(false);
    expect(shouldNotifyBoardCards(new Date("2026-11-18T11:50:00Z"), now)).toBe(true);
  });

  it("counts only cards the client added, and refuses with a 429 over the limit", async () => {
    counts.cards = [30, 30];
    counts.sql = [];
    await expect(assertWithinBoardCardQuota("c1")).rejects.toMatchObject({ status: 429 });
    expect(counts.sql.every((q) => q.includes("createdByClient"))).toBe(true);
    counts.cards = [2, 10];
    await expect(assertWithinBoardCardQuota("c1")).resolves.toBeUndefined();
  });

  it("refuses feedback over the limit with a 429", async () => {
    counts.feedback = 60;
    await expect(assertWithinBoardFeedbackQuota("w1")).rejects.toMatchObject({ status: 429 });
    counts.feedback = 3;
    await expect(assertWithinBoardFeedbackQuota("w1")).resolves.toBeUndefined();
  });
});

describe("how much the client can change on their Board", () => {
  it("allows 120 edits an hour per wiki, then says why it stopped", () => {
    expect(BOARD_QUOTA.editsPerHour).toBe(120);
    expect(boardEditQuotaBreach(119)).toBeNull();
    expect(boardEditQuotaBreach(120)).toMatch(/120 changes in the last hour/);
  });

  it("allows 50 screenshots an hour and 200 a day per wiki, counting what's being added", () => {
    expect(boardUploadQuotaBreach({ hour: 49, day: 49 }, 1)).toBeNull();
    expect(boardUploadQuotaBreach({ hour: 49, day: 49 }, 2)).toMatch(/50 screenshots in an hour/);
    expect(boardUploadQuotaBreach({ hour: 0, day: 199 }, 1)).toBeNull();
    expect(boardUploadQuotaBreach({ hour: 0, day: 199 }, 2)).toMatch(/200 screenshots today/);
  });

  it("tells the team about a card's edits once per 10 minutes", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(shouldNotifyCardChange(null, now)).toBe(true);
    expect(shouldNotifyCardChange(new Date(now.getTime() - 9 * 60_000), now)).toBe(false);
    expect(shouldNotifyCardChange(new Date(now.getTime() - 10 * 60_000), now)).toBe(true);
  });
});

describe("the edit and upload counters", () => {
  it("edits count change entries only, and feedback never counts them", async () => {
    counts.feedbackWhere = [];
    counts.edits = 120;
    await expect(assertWithinBoardEditQuota("w1")).rejects.toMatchObject({ status: 429 });
    counts.edits = 3;
    await expect(assertWithinBoardEditQuota("w1")).resolves.toBeUndefined();
    counts.feedback = 0;
    await assertWithinBoardFeedbackQuota("w1");
    expect(counts.feedbackWhere.at(-1)).toMatchObject({ kind: { not: "change" } });
  });

  it("uploads are counted per wiki, and refused before anything is stored", async () => {
    counts.uploads = [49, 49];
    await expect(assertWithinBoardUploadQuota("w1", 2)).rejects.toMatchObject({ status: 429 });
    counts.uploads = [10, 10];
    await expect(assertWithinBoardUploadQuota("w1", 2)).resolves.toBeUndefined();
  });
});
