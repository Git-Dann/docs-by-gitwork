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
  move: vi.fn<(id: string, input: unknown) => Promise<boolean>>(async () => true),
  clientUser: vi.fn(async () => null as unknown),
  staff: vi.fn(async () => null as unknown),
  member: vi.fn<(userId: string, ws: string, opts?: unknown) => Promise<unknown>>(async () => null),
  inScope: vi.fn<(user: unknown, clientId: string) => Promise<void>>(async () => undefined),
  cardQuota: vi.fn<(clientId: string) => Promise<void>>(async () => undefined),
  feedbackQuota: vi.fn<(wikiId: string) => Promise<void>>(async () => undefined),
  countCards: vi.fn(async () => 1),
  claim: vi.fn(async () => ({ count: 1 })),
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

vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    clientWiki: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => db.wikis.find((w) => matches(w, where)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: Row }) => db.wikis.find((w) => w.id === where.id) ?? null),
      updateMany: spies.claim,
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
    $executeRaw: vi.fn(async () => 1),
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return { prisma };
});
vi.mock("@/server/notifications", () => ({ dispatchNotification: spies.dispatch }));
vi.mock("@/server/tasks", () => ({ moveTaskForClient: spies.move, assertClientInScope: spies.inScope }));
vi.mock("@/server/mcp/auth", () => ({ resolveEffectiveUserById: spies.member }));
vi.mock("@/server/wiki-board-limit", () => ({
  assertWithinBoardCardQuota: spies.cardQuota,
  assertWithinBoardFeedbackQuota: spies.feedbackQuota,
  countClientCards: spies.countCards,
  consumeBoardQuota: vi.fn(async () => undefined),
  pruneBoardQuota: vi.fn(),
  shouldNotifyBoardCards: (last: Date | null) => !last,
  shouldNotifyCardChange: () => false,
}));
vi.mock("@/server/wiki-access", () => ({
  wikiAccessCookieName: (id: string) => `wiki_access_${id}`,
  resolveWikiAccessUser: spies.clientUser,
}));
vi.mock("@/auth", () => ({ auth: spies.staff }));
vi.mock("@/server/rate-limit", () => ({ assertWithinRateLimit: vi.fn(async () => undefined), clientIpFrom: () => "1.2.3.4" }));

import { resolveBoardWriter } from "../wiki-board-access";
import {
  addBoardFeedback,
  createBoardCard,
  forPublicBoard,
  listBoardFeedback,
  moveBoardCard,
  scopeBoardToSection,
  type BoardWriter,
} from "../wiki-board";
import type { WikiBoardCard, WikiBoardSection } from "@/types/wiki-board";

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
    { id: "w1", clientId: "c1", shareToken: "whole", shareEnabled: true, boardEnabled: true, pageShareTokens: ["sheet-link", "board-link"], pageShares: { sheets: "sheet-link", board: "board-link" }, client: { slug: "wedge", workspaceId: "ws" }, boardClientNotifiedAt: null },
  ];
  db.clients = [
    { id: "c1", workspaceId: "ws", slug: "wedge", name: "Wedge", taskBoardColumns: COLUMNS },
    { id: "c2", workspaceId: "ws", slug: "other", name: "Other", taskBoardColumns: [] },
  ];
  db.tasks = [
    { id: "t1", clientId: "c1", parentId: null, archivedAt: null, title: "Bag management", status: "IN_REVIEW", workspaceId: "ws", assigneeId: null, assignees: [{ id: "dev1" }], itemType: "feature", metadata: null },
    { id: "t2", clientId: "c2", parentId: null, archivedAt: null, title: "Someone else's", status: "BACKLOG", workspaceId: "ws", assigneeId: null, assignees: [], itemType: "feature", metadata: null },
    { id: "t3", clientId: "c1", parentId: null, archivedAt: null, title: "Unowned", status: "BACKLOG", workspaceId: "ws", assigneeId: null, assignees: [], itemType: "feedback", metadata: null },
    // The team's own dev task: not a card, not added by the client.
    { id: "t4", clientId: "c1", parentId: null, archivedAt: null, title: "Backend: rounds endpoint", status: "DOING", workspaceId: "ws", assigneeId: null, assignees: [], itemType: null, metadata: null },
    // A card the client added, which has since lost its type: still theirs to act on.
    { id: "t5", clientId: "c1", parentId: null, archivedAt: null, title: "Mine", status: "BACKLOG", workspaceId: "ws", assigneeId: null, assignees: [], itemType: null, metadata: { createdByClient: { wikiUserId: "wu1" } } },
    { id: "t6", clientId: "c1", parentId: null, archivedAt: null, title: "Shipped", status: "DONE", workspaceId: "ws", assigneeId: null, assignees: [], itemType: "feature", metadata: null },
  ];
  db.releases = [{ id: "r1", clientId: "c1" }, { id: "r9", clientId: "c2" }];
  db.feedback = [];
  db.created = [];
  spies.dispatch.mockClear();
  spies.move.mockReset().mockResolvedValue(true);
  spies.clientUser.mockReset().mockResolvedValue(null);
  spies.staff.mockReset().mockResolvedValue(null);
  spies.member.mockReset().mockResolvedValue(null);
  spies.inScope.mockReset().mockResolvedValue(undefined);
  spies.cardQuota.mockReset().mockResolvedValue(undefined);
  spies.feedbackQuota.mockReset().mockResolvedValue(undefined);
  spies.countCards.mockReset().mockResolvedValue(1);
  spies.claim.mockReset().mockResolvedValue({ count: 1 });
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

  it("a member of this client's team writes as the team", async () => {
    spies.staff.mockResolvedValue({ user: { id: "u1", name: "Dan Lindsay", email: "d@x" } });
    spies.member.mockResolvedValue({ id: "u1", name: "Dan Lindsay", email: "d@x", role: "ADMIN", workspaceId: "ws" });
    const out = await resolveBoardWriter(req(), "whole");
    expect(out).toMatchObject({ ok: true, writer: { userId: "u1", wikiUserId: null, name: "Dan Lindsay" } });
    // Looked up in the CLIENT's workspace only.
    expect(spies.member).toHaveBeenCalledWith("u1", "ws", { onlyThisWorkspace: true });
  });

  it("a session from another business is not the team", async () => {
    spies.staff.mockResolvedValue({ user: { id: "u9", name: "Elsewhere" } });
    spies.member.mockResolvedValue(null); // no active membership in this client's workspace
    expect(await resolveBoardWriter(req(), "whole")).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("a guest is not the team", async () => {
    spies.staff.mockResolvedValue({ user: { id: "g1", name: "Guest" } });
    spies.member.mockResolvedValue({ id: "g1", name: "Guest", email: "g@x", role: "GUEST", workspaceId: "ws" });
    expect(await resolveBoardWriter(req(), "whole")).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("a developer who can't open this client is not the team", async () => {
    spies.staff.mockResolvedValue({ user: { id: "d1", name: "Dev" } });
    spies.member.mockResolvedValue({ id: "d1", name: "Dev", email: "d@x", role: "DEVELOPER", workspaceId: "ws" });
    spies.inScope.mockRejectedValue(new Error("You are not assigned to this client"));
    expect(await resolveBoardWriter(req(), "whole")).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("a client user signed in alongside a staff session still writes as the client", async () => {
    spies.clientUser.mockResolvedValue({ id: "wu1", displayName: "Luke", email: "l@x", name: "Luke" });
    spies.staff.mockResolvedValue({ user: { id: "u1" } });
    expect(await resolveBoardWriter(req("cookie"), "whole")).toMatchObject({ ok: true, writer: { wikiUserId: "wu1", userId: null } });
  });
});

describe("moving a card", () => {
  it("a card on another client's board is a 404, and nothing moves", async () => {
    await expect(moveBoardCard(client, "t2", { laneKey: "TODO", orderKey: 1 })).rejects.toMatchObject({ status: 404 });
    expect(spies.move).not.toHaveBeenCalled();
  });

  it("a client can move a card into Done (Dan, Nov 2026)", async () => {
    await moveBoardCard(client, "t1", { laneKey: "DONE", orderKey: 1 }).catch(() => undefined);
    expect(spies.move).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "DONE" }));
  });

  it("a column that isn't on the board is a 409", async () => {
    await expect(moveBoardCard(client, "t1", { laneKey: "col_gone0000", orderKey: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it("moves into the column's status and column, named after the client, only if the card is unchanged", async () => {
    await moveBoardCard(client, "t1", { laneKey: "col_qa00000", orderKey: 7 }).catch(() => undefined);
    expect(spies.move).toHaveBeenCalledWith("t1", {
      status: "IN_REVIEW",
      orderKey: 7,
      boardColumnId: "col_qa00000",
      movedBy: "Luke M.",
      expect: { clientId: "c1", fromStatus: "IN_REVIEW" },
    });
  });

  it("a card the team changed meanwhile (marked Done, archived) is a 409, not a reopen", async () => {
    spies.move.mockResolvedValue(false);
    await expect(moveBoardCard(client, "t1", { laneKey: "col_ideas000", orderKey: 1 })).rejects.toMatchObject({ status: 409 });
    expect(spies.move).toHaveBeenCalled();
  });

  it("a client can move a live card back out of Done", async () => {
    await moveBoardCard(client, "t6", { laneKey: "TODO", orderKey: 1 }).catch(() => undefined);
    expect(spies.move).toHaveBeenCalledWith("t6", expect.objectContaining({ status: "TODO", expect: { clientId: "c1", fromStatus: "DONE" } }));
  });

  it("a client can't move the team's dev task: it's a 404, like a task that isn't there", async () => {
    await expect(moveBoardCard(client, "t4", { laneKey: "col_ideas000", orderKey: 1 })).rejects.toMatchObject({ status: 404 });
    expect(spies.move).not.toHaveBeenCalled();
  });

  it("a client can move a card they added", async () => {
    await moveBoardCard(client, "t5", { laneKey: "TODO", orderKey: 1 }).catch(() => undefined);
    expect(spies.move).toHaveBeenCalled();
  });

  it("the team, on the client's page, can move a dev task", async () => {
    await moveBoardCard(team, "t4", { laneKey: "col_ideas000", orderKey: 1 }).catch(() => undefined);
    expect(spies.move).toHaveBeenCalled();
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

  it("a client over their card limit is refused, and nothing is written", async () => {
    spies.cardQuota.mockRejectedValue(Object.assign(new Error("That's 30 new cards"), { status: 429 }));
    await expect(createBoardCard(client, { title: "x", itemType: "feature", laneKey: "col_ideas000" })).rejects.toMatchObject({ status: 429 });
    expect(db.created).toHaveLength(0);
  });

  it("the team isn't held to the client's card limit, and isn't marked as the client", async () => {
    spies.cardQuota.mockRejectedValue(Object.assign(new Error("limit"), { status: 429 }));
    await createBoardCard(team, { title: "Team card", itemType: "feature", laneKey: "col_ideas000" }).catch(() => undefined);
    expect(db.created[0]).toMatchObject({ title: "Team card", createdById: "u1" });
    expect(db.created[0]).not.toHaveProperty("metadata");
    expect(spies.dispatch).not.toHaveBeenCalled();
  });

  it("a burst of client cards is one notification, claimed once", async () => {
    await createBoardCard(client, { title: "One", itemType: "feature", laneKey: "col_ideas000" }).catch(() => undefined);
    expect(spies.dispatch).toHaveBeenCalledTimes(1);
    // Another request claimed the window first: no second notification.
    spies.claim.mockResolvedValue({ count: 0 });
    db.wikis[0].boardClientNotifiedAt = null;
    await createBoardCard(client, { title: "Two", itemType: "feature", laneKey: "col_ideas000" }).catch(() => undefined);
    expect(spies.dispatch).toHaveBeenCalledTimes(1);
  });

  it("the notification says how many cards arrived", async () => {
    spies.countCards.mockResolvedValue(4);
    await createBoardCard(client, { title: "Fourth", itemType: "feature", laneKey: "col_ideas000" }).catch(() => undefined);
    expect(spies.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Wedge added 4 cards to their board", count: 4, target: { kind: "clientTeam" } }),
    );
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

  it("a client can't read, comment on or sign off the team's dev task", async () => {
    await expect(addBoardFeedback(client, "t4", { kind: "comment", body: "hi" })).rejects.toMatchObject({ status: 404 });
    await expect(addBoardFeedback(client, "t4", { kind: "approved" })).rejects.toMatchObject({ status: 404 });
    await expect(listBoardFeedback(client, "t4")).rejects.toMatchObject({ status: 404 });
    expect(db.feedback).toHaveLength(0);
  });

  it("a client over their feedback limit is refused; the team's replies aren't limited", async () => {
    spies.feedbackQuota.mockRejectedValue(Object.assign(new Error("That's 60 comments"), { status: 429 }));
    await expect(addBoardFeedback(client, "t1", { kind: "comment", body: "again" })).rejects.toMatchObject({ status: 429 });
    expect(db.feedback).toHaveLength(0);
    await addBoardFeedback(team, "t1", { kind: "comment", body: "On it" });
    expect(db.feedback).toHaveLength(1);
  });

  it("the team's reply is shown as Gitwork and doesn't notify anyone", async () => {
    const entry = await addBoardFeedback(team, "t1", { kind: "comment", body: "On it" });
    expect(entry.side).toBe("team");
    expect(spies.dispatch).not.toHaveBeenCalled();
  });
});

function card(over: Partial<WikiBoardCard>): WikiBoardCard {
  return {
    id: "x",
    title: "X",
    itemType: null,
    tier: null,
    area: null,
    priority: "MEDIUM",
    status: "BACKLOG",
    laneKey: "BACKLOG",
    orderKey: 1,
    release: null,
    progress: null,
    dueDate: null,
    people: ["Hassaan B."],
    signOff: null,
    feedbackCount: 0,
    description: null,
    subtasks: [],
    images: [],
    stageHistory: [],
    estimateHours: null,
    dependsOn: [],
    isCard: false,
    addedByClient: false,
    updatedAt: "2026-11-18T00:00:00.000Z",
    ...over,
  };
}

function board(cards: WikiBoardCard[], showAllTasks: boolean): WikiBoardSection {
  return {
    enabled: true,
    showAllTasks,
    releases: [],
    areas: [],
    lanes: [
      {
        key: "BACKLOG",
        label: "Backlog",
        stage: "BACKLOG",
        columnId: null,
        canAdd: true,
        total: { cards: cards.filter((c) => c.isCard).length, other: cards.filter((c) => !c.isCard).length },
        hidden: { cards: 0, other: 3 },
        groups: [{ releaseId: null, label: "No release", startDate: null, endDate: null, cards }],
      },
    ],
  };
}

const featureCard = card({ id: "f", title: "Bag management", itemType: "feature", isCard: true, description: "Spec", subtasks: [{ title: "s", done: false }], feedbackCount: 2, signOff: "approved" });
const devTask = card({ id: "d", title: "Backend: rounds endpoint", description: "INTERNAL: ssh key in 1Password", subtasks: [{ title: "secret step", done: false }], feedbackCount: 1, signOff: "approved", dueDate: "2026-12-01" });

describe("the client's copy of the board", () => {
  it("carries only the allow-listed card fields", () => {
    const leaky = { ...featureCard, assigneeEmail: "dev@gitwork.co.uk", estimateGbp: 900 } as WikiBoardCard;
    const out = forPublicBoard(board([leaky], false)).lanes[0].groups[0].cards[0] as unknown as Record<string, unknown>;
    expect(out.id).toBe("f");
    expect(out).not.toHaveProperty("assigneeEmail");
    expect(out).not.toHaveProperty("estimateGbp");
  });

  it("leaves the team's dev tasks out by default, and doesn't count them", () => {
    const out = forPublicBoard(board([featureCard, devTask], false));
    expect(out.lanes[0].groups[0].cards.map((c) => c.id)).toEqual(["f"]);
    expect(out.lanes[0].total.other).toBe(0);
    expect(out.lanes[0].hidden.other).toBe(0);
    expect(JSON.stringify(out)).not.toContain("INTERNAL");
  });

  it("drops a release group left empty once dev tasks are taken out", () => {
    expect(forPublicBoard(board([devTask], false)).lanes[0].groups).toEqual([]);
  });

  it("with Show all tasks on, a dev task goes as its title, column and people — nothing else", () => {
    const out = forPublicBoard(board([featureCard, devTask], true));
    const dev = out.lanes[0].groups[0].cards.find((c) => c.id === "d")!;
    expect(dev).toMatchObject({ title: "Backend: rounds endpoint", laneKey: "BACKLOG", people: ["Hassaan B."] });
    expect(dev).toMatchObject({ description: null, subtasks: [], feedbackCount: 0, signOff: null, dueDate: null, isCard: false });
    expect(JSON.stringify(out)).not.toContain("INTERNAL");
    expect(JSON.stringify(out)).not.toContain("secret step");
    // The product card keeps everything.
    expect(out.lanes[0].groups[0].cards.find((c) => c.id === "f")).toMatchObject({ description: "Spec", feedbackCount: 2, signOff: "approved" });
  });

  it("a card the client added keeps its detail even without a type", () => {
    const mine = card({ id: "m", addedByClient: true, description: "My note" });
    expect(forPublicBoard(board([mine], false)).lanes[0].groups[0].cards[0].description).toBe("My note");
  });

  it("is empty while the section is off", () => {
    expect(forPublicBoard({ enabled: false, showAllTasks: false, lanes: [], releases: [], areas: [] }).lanes).toEqual([]);
  });
});

describe("a link for one section", () => {
  const dto = { board: board([featureCard], false), other: 1 };

  it("doesn't carry the board unless it is the Board's own link", () => {
    expect(scopeBoardToSection(dto, "changelog").board.enabled).toBe(false);
    expect(scopeBoardToSection(dto, "changelog").board.lanes).toEqual([]);
    expect(scopeBoardToSection(dto, "board").board.lanes).toHaveLength(1);
  });

  it("the whole-wiki link carries it", () => {
    expect(scopeBoardToSection(dto, null).board.lanes).toHaveLength(1);
  });
});
