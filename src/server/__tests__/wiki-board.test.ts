/**
 * The client Board's gate and writes (src/server/wiki-board-access.ts, src/server/wiki-board.ts).
 *
 * Prisma is an in-memory fake that honours the `where` it is given, so "a card from another
 * client is a 404" is checked against the real query, not a mock that returns null on cue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  wikis: [] as Row[],
  tasks: [] as Row[],
  clients: [] as Row[],
  releases: [] as Row[],
  feedback: [] as Row[],
  created: [] as Row[],
}));
const spies = vi.hoisted(() => ({
  dispatch: vi.fn(),
  move: vi.fn(async () => undefined),
  clientUser: vi.fn(async () => null as unknown),
  staff: vi.fn(async () => null as unknown),
}));

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const cond = v as Row;
      if ("has" in cond) return Array.isArray(row[k]) && (row[k] as unknown[]).includes(cond.has);
      if ("in" in cond) return (cond.in as unknown[]).includes(row[k]);
      return true;
    }
    return (row[k] ?? null) === v;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWiki: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => db.wikis.find((w) => matches(w, where)) ?? null),
      upsert: vi.fn(async () => ({})),
    },
    task: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const t = db.tasks.find((r) => matches(r, where));
        return t ? { ...t, client: db.clients.find((c) => c.id === t.clientId), assignees: t.assignees ?? [], subtasks: [] } : null;
      }),
      findUnique: vi.fn(async ({ where }: { where: Row }) => db.tasks.find((r) => r.id === where.id) ?? null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `new-${db.created.length + 1}`, assignees: [], subtasks: [], updatedAt: new Date(), ...data };
        db.created.push(row);
        db.tasks.push(row);
        return { id: row.id };
      }),
      groupBy: vi.fn(async () => []),
    },
    workspaceClient: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => db.clients.find((c) => c.id === where.id) ?? null),
    },
    clientRelease: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => db.releases.find((r) => matches(r, where)) ?? null),
      findMany: vi.fn(async () => []),
    },
    taskClientFeedback: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `fb-${db.feedback.length + 1}`, createdAt: new Date(), ...data };
        db.feedback.push(row);
        return row;
      }),
      findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock("@/server/notifications", () => ({ dispatchNotification: spies.dispatch }));
vi.mock("@/server/tasks", () => ({ moveTaskForClient: spies.move, assertClientInScope: vi.fn(async () => undefined) }));
vi.mock("@/server/wiki-access", () => ({
  wikiAccessCookieName: (id: string) => `wiki_access_${id}`,
  resolveWikiAccessUser: spies.clientUser,
}));
vi.mock("@/auth", () => ({ auth: spies.staff }));
vi.mock("@/server/rate-limit", () => ({ assertWithinRateLimit: vi.fn(async () => undefined), clientIpFrom: () => "1.2.3.4" }));

import { resolveBoardWriter } from "../wiki-board-access";
import { addBoardFeedback, createBoardCard, forPublicBoard, moveBoardCard, type BoardWriter } from "../wiki-board";

const COLUMNS = [
  { id: "col_ideas000", name: "Ideas", stage: "BACKLOG", isDefault: true },
  { id: "col_qa00000", name: "QA", stage: "IN_REVIEW" },
];

function req(cookie?: string): NextRequest {
  return {
    cookies: { get: (name: string) => (cookie && name === "wiki_access_w1" ? { value: cookie } : undefined) },
    headers: new Headers(),
  } as unknown as NextRequest;
}

const client: BoardWriter = { wikiId: "w1", clientId: "c1", clientSlug: "wedge", name: "Luke M.", wikiUserId: "wu1", userId: null };
const team: BoardWriter = { ...client, name: "Dan", wikiUserId: null, userId: "u1" };

beforeEach(() => {
  db.wikis = [
    { id: "w1", clientId: "c1", shareToken: "whole", shareEnabled: true, boardEnabled: true, pageShareTokens: ["sheet-link", "board-link"], pageShares: { sheets: "sheet-link", board: "board-link" }, client: { slug: "wedge" } },
  ];
  db.clients = [
    { id: "c1", workspaceId: "ws", slug: "wedge", name: "Wedge", taskBoardColumns: COLUMNS },
    { id: "c2", workspaceId: "ws", slug: "other", name: "Other", taskBoardColumns: [] },
  ];
  db.tasks = [
    { id: "t1", clientId: "c1", parentId: null, archivedAt: null, title: "Bag management", status: "IN_REVIEW", workspaceId: "ws", assigneeId: null, assignees: [{ id: "dev1" }] },
    { id: "t2", clientId: "c2", parentId: null, archivedAt: null, title: "Someone else's", status: "BACKLOG", workspaceId: "ws", assigneeId: null, assignees: [] },
    { id: "t3", clientId: "c1", parentId: null, archivedAt: null, title: "Unowned", status: "BACKLOG", workspaceId: "ws", assigneeId: null, assignees: [] },
  ];
  db.releases = [{ id: "r1", clientId: "c1" }, { id: "r9", clientId: "c2" }];
  db.feedback = [];
  db.created = [];
  spies.dispatch.mockClear();
  spies.move.mockClear();
  spies.clientUser.mockReset().mockResolvedValue(null);
  spies.staff.mockReset().mockResolvedValue(null);
});

describe("who may write to the Board", () => {
  it("an unknown link is not found", async () => {
    expect(await resolveBoardWriter(req(), "nope")).toEqual({ ok: false, reason: "not_found" });
  });

  it("a link shared for another section is not a Board credential", async () => {
    expect(await resolveBoardWriter(req(), "sheet-link")).toEqual({ ok: false, reason: "wrong_section" });
  });

  it("a link for the Board itself gets through to the sign-in check", async () => {
    expect(await resolveBoardWriter(req(), "board-link")).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("the section must be on", async () => {
    db.wikis[0].boardEnabled = false;
    expect(await resolveBoardWriter(req(), "whole")).toEqual({ ok: false, reason: "section_disabled" });
  });

  it("nobody signed in is refused", async () => {
    expect(await resolveBoardWriter(req(), "whole")).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("a signed-in client writes as themselves, named from their sign-in", async () => {
    spies.clientUser.mockResolvedValue({ id: "wu1", displayName: "Luke McFarland", email: "luke@x.com", name: "Luke" });
    const out = await resolveBoardWriter(req("cookie"), "whole");
    expect(out).toEqual({
      ok: true,
      writer: { wikiId: "w1", clientId: "c1", clientSlug: "wedge", name: "Luke McFarland", wikiUserId: "wu1", userId: null },
    });
  });

  it("a Gitwork session writes as the team", async () => {
    spies.staff.mockResolvedValue({ user: { id: "u1", name: "Dan Lindsay", email: "d@x" } });
    const out = await resolveBoardWriter(req(), "whole");
    expect(out).toMatchObject({ ok: true, writer: { userId: "u1", wikiUserId: null, name: "Dan Lindsay" } });
  });
});

describe("moving a card", () => {
  it("a card on another client's board is a 404, and nothing moves", async () => {
    await expect(moveBoardCard(client, "t2", { laneKey: "TODO", orderKey: 1 })).rejects.toMatchObject({ status: 404 });
    expect(spies.move).not.toHaveBeenCalled();
  });

  it("a client can't move a card into Done", async () => {
    await expect(moveBoardCard(client, "t1", { laneKey: "DONE", orderKey: 1 })).rejects.toMatchObject({ status: 403 });
    expect(spies.move).not.toHaveBeenCalled();
  });

  it("a column that isn't on the board is a 409", async () => {
    await expect(moveBoardCard(client, "t1", { laneKey: "col_gone0000", orderKey: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it("moves into the column's status and column, named after the client", async () => {
    await moveBoardCard(client, "t1", { laneKey: "col_qa00000", orderKey: 7 }).catch(() => undefined);
    expect(spies.move).toHaveBeenCalledWith("t1", { status: "IN_REVIEW", orderKey: 7, boardColumnId: "col_qa00000", movedBy: "Luke M." });
  });
});

describe("adding a card", () => {
  it("only into an early column", async () => {
    await expect(
      createBoardCard(client, { title: "x", itemType: "feature", laneKey: "IN_REVIEW" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.created).toHaveLength(0);
  });

  it("a release from another client is refused", async () => {
    await expect(
      createBoardCard(client, { title: "x", itemType: "feature", laneKey: "col_ideas000", releaseId: "r9" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.created).toHaveLength(0);
  });

  it("is a real task on the board, says who added it, and tells the team", async () => {
    await createBoardCard(client, { title: "  Club tracking  ", itemType: "bug", laneKey: "col_ideas000", releaseId: "r1", links: ["https://x.dev"] }).catch(() => undefined);
    expect(db.created[0]).toMatchObject({
      clientId: "c1",
      title: "Club tracking",
      itemType: "bug",
      status: "BACKLOG",
      boardColumnId: "col_ideas000",
      releaseId: "r1",
      createdById: null,
      description: "Links:\n- [x.dev](https://x.dev)",
      metadata: { createdByClient: { wikiUserId: "wu1", name: "Luke M." } },
    });
    expect(spies.dispatch).toHaveBeenCalledWith(expect.objectContaining({ event: "tasks.client_request", target: { kind: "clientTeam" } }));
  });
});

describe("feedback and sign-off", () => {
  it("only the client signs off: the team can only comment", async () => {
    await expect(addBoardFeedback(team, "t1", { kind: "approved" })).rejects.toMatchObject({ status: 403 });
    expect(db.feedback).toHaveLength(0);
  });

  it("feedback on another client's card is a 404", async () => {
    await expect(addBoardFeedback(client, "t2", { kind: "comment", body: "hi" })).rejects.toMatchObject({ status: 404 });
  });

  it("Changes needed must say what", async () => {
    await expect(addBoardFeedback(client, "t1", { kind: "changes_requested", body: " " })).rejects.toMatchObject({ status: 400 });
  });

  it("a client's sign-off is recorded as theirs and tells the card's people", async () => {
    const entry = await addBoardFeedback(client, "t1", { kind: "approved" });
    expect(entry).toMatchObject({ kind: "approved", side: "client", authorName: "Luke M." });
    expect(db.feedback[0]).toMatchObject({ authorWikiUserId: "wu1", authorUserId: null });
    expect(spies.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tasks.client_feedback", target: { kind: "users", userIds: ["dev1"] } }),
    );
  });

  it("with nobody on the card, the client's team is told", async () => {
    await addBoardFeedback(client, "t3", { kind: "comment", body: "Any news?" });
    expect(spies.dispatch).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: "clientTeam" } }));
  });

  it("the team's reply is shown as Gitwork and doesn't notify anyone", async () => {
    const entry = await addBoardFeedback(team, "t1", { kind: "comment", body: "On it" });
    expect(entry.side).toBe("team");
    expect(spies.dispatch).not.toHaveBeenCalled();
  });
});

describe("the client's copy of the board", () => {
  it("carries only the allow-listed card fields", () => {
    const section = {
      enabled: true,
      releases: [],
      areas: [],
      lanes: [
        {
          key: "BACKLOG",
          label: "Backlog",
          stage: "BACKLOG" as const,
          columnId: null,
          canAdd: true,
          total: { cards: 1, other: 0 },
          hidden: { cards: 0, other: 0 },
          groups: [
            {
              releaseId: null,
              label: "No release",
              startDate: null,
              endDate: null,
              cards: [{ id: "a", title: "A", assigneeEmail: "dev@gitwork.co.uk", estimateGbp: 900 } as never],
            },
          ],
        },
      ],
    };
    const card = forPublicBoard(section).lanes[0].groups[0].cards[0] as unknown as Record<string, unknown>;
    expect(card.id).toBe("a");
    expect(card).not.toHaveProperty("assigneeEmail");
    expect(card).not.toHaveProperty("estimateGbp");
  });

  it("is empty while the section is off", () => {
    expect(forPublicBoard({ enabled: false, lanes: [], releases: [], areas: [] }).lanes).toEqual([]);
  });
});
