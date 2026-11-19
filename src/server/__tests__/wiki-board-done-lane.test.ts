/**
 * Older cards in a Done column, as each audience receives them (src/server/wiki-board.ts
 * `boardLanePage`, CLAUDE.md §126.5). The client's link always gets the client's copy: their own
 * cards, and the team's dev tasks only as a title while the team shows them. A dev task never
 * reaches the client with anything more, and never at all when the team hides them.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/server/tasks", () => ({ moveTaskForClient: vi.fn(), assertClientInScope: vi.fn() }));

import { boardLanePage, BoardError } from "../wiki-board";
import type { WikiBoardCard } from "@/types/wiki-board";

function card(id: string, over: Partial<WikiBoardCard> = {}): WikiBoardCard {
  return {
    id,
    title: id,
    itemType: "feature",
    tier: "premium",
    area: "Search",
    list: null,
    priority: "MEDIUM",
    estimateHours: 8,
    status: "DONE",
    laneKey: "DONE",
    orderKey: 0,
    release: null,
    progress: null,
    dueDate: null,
    people: ["Sam K."],
    signOff: null,
    feedbackCount: 0,
    description: "card notes",
    subtasks: [],
    images: [],
    removedImages: [],
    stageHistory: [],
    doneAt: null,
    dependsOn: [],
    isCard: true,
    addedByClient: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const dev = card("dev1", { itemType: null, isCard: false, title: "Rotate the Stripe keys", description: "secret plan", area: "Infra" });
const shipped = card("c1", { dependsOn: [{ id: "dev1", title: "Rotate the Stripe keys" }] });
const all = (showAllTasks: boolean) => ({
  cards: [shipped, dev, card("c2")],
  columns: [],
  completedAt: new Map<string, string | null>([
    ["c1", "2026-03-01T00:00:00.000Z"],
    ["c2", "2026-02-01T00:00:00.000Z"],
    ["dev1", "2026-03-05T00:00:00.000Z"],
  ]),
  showAllTasks,
});
const ask = (over: Partial<Parameters<typeof boardLanePage>[1]> = {}) => ({
  laneKey: "DONE",
  kind: "cards" as const,
  offset: 0,
  limit: 100,
  audience: "client" as const,
  ...over,
});

describe("older Done cards for the client", () => {
  it("never names a dev task, even one a card depends on", () => {
    const page = boardLanePage(all(false), ask());
    expect(page.cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(JSON.stringify(page)).not.toContain("Rotate the Stripe keys");
  });

  it("sends no dev tasks at all while the team hides them, and doesn't count them", () => {
    const page = boardLanePage(all(false), ask({ kind: "other" }));
    expect(page.cards).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("sends a dev task as a title and a column only, while the team shows them", () => {
    const page = boardLanePage(all(true), ask({ kind: "other" }));
    expect(page.cards).toHaveLength(1);
    const out = page.cards[0];
    expect(out.title).toBe("Rotate the Stripe keys");
    expect(out.description).toBeNull();
    expect(out.area).toBeNull();
    expect(out.estimateHours).toBeNull();
  });

  it("the team gets its own copy", () => {
    const page = boardLanePage(all(false), ask({ audience: "team", kind: "other" }));
    expect(page.cards[0].description).toBe("secret plan");
  });
});

describe("which column", () => {
  it("refuses a column that isn't a done column, and one that isn't on the board", () => {
    expect(() => boardLanePage(all(false), ask({ laneKey: "TODO" }))).toThrow(BoardError);
    expect(() => boardLanePage(all(false), ask({ laneKey: "col_nope" }))).toThrow(BoardError);
  });
});
