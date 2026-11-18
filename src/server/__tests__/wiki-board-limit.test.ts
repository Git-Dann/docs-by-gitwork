/**
 * How much a client can add to their Board, and how often the team is told
 * (src/server/wiki-board-limit.ts). The thresholds are pure; the database wrappers only count.
 */
import { describe, expect, it, vi } from "vitest";

const counts = vi.hoisted(() => ({ cards: [0, 0], feedback: 0, sql: [] as string[] }));
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
        return counts.feedback;
      }),
    },
  },
}));

import {
  assertWithinBoardCardQuota,
  assertWithinBoardFeedbackQuota,
  BOARD_QUOTA,
  boardCardQuotaBreach,
  boardFeedbackQuotaBreach,
  shouldNotifyBoardCards,
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
