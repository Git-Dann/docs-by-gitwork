/**
 * Adding, editing, deleting and restoring cards on the client's Board, and screenshots
 * (src/server/wiki-board.ts). Full control for the client over every card they can see, except
 * who works on it (Dan, Nov 2026). Prisma is an in-memory fake that honours the `where` it is
 * given, so "a card on another client is a 404" is checked against the real query.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tasks: [] as Row[],
  clients: [] as Row[],
  releases: [] as Row[],
  feedback: [] as Row[],
  attachments: [] as Row[],
  comments: [] as Row[],
  updateManyCalls: [] as Array<{ where: Row; data: Row }>,
}));
const spies = vi.hoisted(() => ({
  dispatch: vi.fn(),
  cardQuota: vi.fn(async () => undefined),
  consume: vi.fn<(db: unknown, wikiId: string, action: string, n?: number) => Promise<void>>(async () => undefined),
  lock: vi.fn(async () => 1),
}));

function cond(value: unknown, c: unknown): boolean {
  if (c && typeof c === "object" && !Array.isArray(c) && !(c instanceof Date)) {
    const o = c as Row;
    if ("in" in o) return (o.in as unknown[]).includes(value);
    if ("not" in o) return o.not === null ? value != null : value !== o.not;
    if ("lt" in o) return value instanceof Date && value < (o.lt as Date);
    return true;
  }
  return (value ?? null) === c;
}
const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => cond(row[k], v));

vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    task: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const t = db.tasks.find((r) => matches(r, where));
        if (!t) return null;
        return {
          assignees: [],
          subtasks: [],
          assignee: null,
          updatedAt: new Date(),
          orderKey: 0,
          boardColumnId: null,
          priority: "MEDIUM",
          ...t,
          client: db.clients.find((c) => c.id === t.clientId),
        };
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) => db.tasks.filter((r) => matches(r, where))),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `new-${db.tasks.length + 1}`, archivedAt: null, parentId: null, ...data };
        db.tasks.push(row);
        return { id: row.id };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        db.updateManyCalls.push({ where, data });
        const hit = db.tasks.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
      groupBy: vi.fn(async () => []),
    },
    workspaceClient: { findUnique: vi.fn(async ({ where }: { where: Row }) => db.clients.find((c) => c.id === where.id) ?? null) },
    clientRelease: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => db.releases.find((r) => matches(r, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Row }) => db.releases.filter((r) => matches(r, where))),
    },
    taskClientFeedback: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `fb-${db.feedback.length + 1}`, createdAt: new Date(), ...data };
        db.feedback.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: Row }) => db.feedback.filter((f) => matches(f, { taskId: where.taskId, kind: where.kind })).at(-1) ?? null),
      findMany: vi.fn(async () => []),
    },
    taskAttachment: {
      count: vi.fn(async ({ where }: { where: Row }) => db.attachments.filter((a) => a.taskId === where.taskId).length),
      create: vi.fn(async ({ data }: { data: Row }) => {
        db.attachments.push({ id: `att-${db.attachments.length + 1}`, ...data });
        return { id: "att" };
      }),
      findMany: vi.fn(async () => []),
    },
    taskComment: { createMany: vi.fn(async ({ data }: { data: Row[] }) => { db.comments.push(...data); return { count: data.length }; }) },
    $queryRaw: vi.fn(async () => []),
    $executeRaw: spies.lock,
  };
  // A transaction that really rolls back: what it wrote is undone if it throws.
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const snap = {
      tasks: db.tasks.map((t) => ({ ...t })),
      feedback: [...db.feedback],
      attachments: [...db.attachments],
      comments: [...db.comments],
    };
    try {
      return await fn(prisma);
    } catch (err) {
      db.tasks = snap.tasks;
      db.feedback = snap.feedback;
      db.attachments = snap.attachments;
      db.comments = snap.comments;
      throw err;
    }
  });
  return { prisma };
});
vi.mock("@/server/notifications", () => ({ dispatchNotification: spies.dispatch }));
vi.mock("@/server/tasks", () => ({ moveTaskForClient: vi.fn(async () => true), assertClientInScope: vi.fn(async () => undefined) }));
vi.mock("@/server/wiki-board-limit", () => ({
  assertWithinBoardCardQuota: spies.cardQuota,
  assertWithinBoardFeedbackQuota: vi.fn(async () => undefined),
  consumeBoardQuota: spies.consume,
  pruneBoardQuota: vi.fn(),
  countClientCards: vi.fn(async () => 1),
  shouldNotifyBoardCards: () => false,
  // The real rule: once per card per 10 minutes.
  shouldNotifyCardChange: (last: Date | null, now: Date) => !last || now.getTime() - last.getTime() >= 600_000,
}));

import { crc32 } from "node:zlib";
import {
  addBoardCardImages,
  createBoardCard,
  deleteBoardCard,
  listBoardFeedback,
  moveBoardCard,
  restoreBoardCard,
  updateBoardCard,
  type BoardWriter,
} from "../wiki-board";

const COLUMNS = [{ id: "col_ideas000", name: "Ideas", stage: "BACKLOG", isDefault: true }];
const client: BoardWriter = { wikiId: "w1", clientId: "c1", clientSlug: "wedge", name: "Luke M.", wikiUserId: "wu1", userId: null };
const team: BoardWriter = { ...client, name: "Dan", wikiUserId: null, userId: "u1" };

const task = (over: Row): Row => ({
  clientId: "c1",
  parentId: null,
  archivedAt: null,
  workspaceId: "ws",
  status: "BACKLOG",
  itemType: "feature",
  tier: null,
  area: null,
  priority: "MEDIUM",
  estimateHours: null,
  dueDate: null,
  releaseId: null,
  description: null,
  metadata: null,
  assigneeId: null,
  productCardId: null,
  externalRef: null,
  ...over,
});

let png: Uint8Array;
beforeEach(async () => {
  db.clients = [
    { id: "c1", workspaceId: "ws", slug: "wedge", name: "Wedge", taskBoardColumns: COLUMNS },
    { id: "c2", workspaceId: "ws", slug: "other", name: "Other", taskBoardColumns: [] },
  ];
  db.tasks = [
    task({ id: "card", title: "Bag management" }),
    // Imported from the client's own planning tool, and one the team made: both the client's to change now.
    task({ id: "forge", title: "Imported", externalRef: "forge:348" }),
    task({ id: "teamcard", title: "Team-made", createdById: "u1" }),
    task({ id: "dev", title: "Backend: rounds endpoint", itemType: null }),
    task({ id: "devlinked", title: "Rounds API", itemType: null, productCardId: "card" }),
    task({ id: "elsewhere", title: "Someone else's", clientId: "c2" }),
    task({ id: "bug", title: "A bug", itemType: "bug" }),
    task({ id: "sub", title: "A sub-item", itemType: "subitem", parentId: "card" }),
  ];
  db.releases = [{ id: "r1", clientId: "c1", version: "1.4", name: null }, { id: "r9", clientId: "c2", version: "9", name: null }];
  db.feedback = [];
  db.attachments = [];
  db.comments = [];
  db.updateManyCalls = [];
  spies.dispatch.mockClear();
  spies.consume.mockReset().mockResolvedValue(undefined);
  spies.lock.mockClear();
  png ??= new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).png().toBuffer());
});

const changes = () => db.feedback.filter((f) => f.kind === "change").map((f) => f.body);

describe("editing a card", () => {
  it("writes the fields, records a readable sentence, and tells the team", async () => {
    await updateBoardCard(client, "card", { priority: "HIGH", dueDate: "2026-12-04", estimateHours: 6 });
    const row = db.tasks.find((t) => t.id === "card")!;
    expect(row).toMatchObject({ priority: "HIGH", estimateHours: 6 });
    expect((row.dueDate as Date).toISOString().slice(0, 10)).toBe("2026-12-04");
    expect(changes()).toEqual(["Luke M. changed the priority from Medium to High, set the estimate to 6h and set the due date to 4 Dec 2026."]);
    expect(db.feedback[0]).toMatchObject({ authorWikiUserId: "wu1", authorUserId: null, authorName: "Luke M." });
    expect(spies.dispatch).toHaveBeenCalledTimes(1);
  });

  it("the write is scoped to this client and to a live card", async () => {
    await updateBoardCard(client, "card", { title: "Bags" });
    expect(db.updateManyCalls[0].where).toMatchObject({ id: "card", clientId: "c1", archivedAt: null });
  });

  it("a run of edits is one notification", async () => {
    await updateBoardCard(client, "card", { priority: "HIGH" });
    await updateBoardCard(client, "card", { priority: "LOW" });
    expect(changes()).toHaveLength(2);
    expect(spies.dispatch).toHaveBeenCalledTimes(1);
  });

  it("an edit that changes nothing writes nothing", async () => {
    await updateBoardCard(client, "card", { priority: "MEDIUM" });
    expect(db.updateManyCalls).toHaveLength(0);
    expect(db.feedback).toHaveLength(0);
  });

  it("the client may edit imported and team-made cards too", async () => {
    await updateBoardCard(client, "forge", { title: "Renamed" });
    await updateBoardCard(client, "teamcard", { title: "Renamed too" });
    expect(db.tasks.find((t) => t.id === "forge")!.title).toBe("Renamed");
    expect(db.tasks.find((t) => t.id === "teamcard")!.title).toBe("Renamed too");
  });

  it("a team dev task is a 404 to the client, and is untouched", async () => {
    await expect(updateBoardCard(client, "dev", { title: "Mine now" })).rejects.toMatchObject({ status: 404 });
    expect(db.tasks.find((t) => t.id === "dev")!.title).toBe("Backend: rounds endpoint");
  });

  it("a card on another client is a 404", async () => {
    await expect(updateBoardCard(client, "elsewhere", { title: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("a release from another client is refused", async () => {
    await expect(updateBoardCard(client, "card", { releaseId: "r9" })).rejects.toMatchObject({ status: 400 });
    expect(db.updateManyCalls).toHaveLength(0);
  });

  it("depends-on must be cards on this board the client can see", async () => {
    await expect(updateBoardCard(client, "card", { dependsOn: ["elsewhere"] })).rejects.toMatchObject({ status: 400 });
    await expect(updateBoardCard(client, "card", { dependsOn: ["dev"] })).rejects.toMatchObject({ status: 400 });
    await expect(updateBoardCard(client, "card", { dependsOn: ["card"] })).rejects.toMatchObject({ status: 400 });
    await updateBoardCard(client, "card", { dependsOn: ["bug"] });
    expect(db.tasks.find((t) => t.id === "card")!.metadata).toMatchObject({ dependsOn: ["bug"] });
    // The team may point at its own dev tasks.
    await updateBoardCard(team, "card", { dependsOn: ["bug", "dev"] });
    expect(db.tasks.find((t) => t.id === "card")!.metadata).toMatchObject({ dependsOn: ["bug", "dev"] });
  });

  it("over the edit limit, nothing is written", async () => {
    spies.consume.mockRejectedValue(Object.assign(new Error("That's 120 changes"), { status: 429 }));
    await expect(updateBoardCard(client, "card", { title: "x" })).rejects.toMatchObject({ status: 429 });
    expect(db.updateManyCalls).toHaveLength(0);
  });

  it("the team's edits are recorded as theirs and notify nobody", async () => {
    await updateBoardCard(team, "card", { area: "Bags" });
    expect(db.feedback[0]).toMatchObject({ authorUserId: "u1", body: "Dan set the area to Bags." });
    expect(spies.dispatch).not.toHaveBeenCalled();
  });

  it("a card deleted meanwhile is a 409", async () => {
    // The read sees it live; it's archived before the write.
    db.tasks.find((t) => t.id === "card")!.archivedAt = null;
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.task.updateMany).mockResolvedValueOnce({ count: 0 });
    await expect(updateBoardCard(client, "card", { title: "x" })).rejects.toMatchObject({ status: 409 });
    expect(changes()).toHaveLength(0);
  });
});

describe("adding a card", () => {
  it("a sub-item goes under a feature card on this client, one level only", async () => {
    const base = { title: "Sub", itemType: "subitem" as const, laneKey: "col_ideas000" };
    await expect(createBoardCard(client, { ...base, parentId: "bug" })).rejects.toMatchObject({ status: 400 });
    await expect(createBoardCard(client, { ...base, parentId: "sub" })).rejects.toMatchObject({ status: 400 });
    await expect(createBoardCard(client, { ...base, parentId: "elsewhere" })).rejects.toMatchObject({ status: 400 });
    await expect(createBoardCard(client, { ...base })).rejects.toMatchObject({ status: 400 });
    const before = db.tasks.length;
    await createBoardCard(client, { ...base, parentId: "card" });
    expect(db.tasks).toHaveLength(before + 1);
    expect(db.tasks.at(-1)).toMatchObject({ parentId: "card", itemType: "subitem", clientId: "c1" });
  });

  it("takes every field, and a cross-client dependency is refused", async () => {
    await expect(
      createBoardCard(client, { title: "x", itemType: "feature", laneKey: "col_ideas000", dependsOn: ["elsewhere"] }),
    ).rejects.toMatchObject({ status: 400 });
    await createBoardCard(client, {
      title: "Club tracking",
      itemType: "feature",
      laneKey: "col_ideas000",
      tier: "premium",
      area: "  GPS   & shots ",
      estimateHours: 12,
      dueDate: "2026-12-04",
      dependsOn: ["bug"],
    });
    expect(db.tasks.at(-1)).toMatchObject({ tier: "premium", area: "GPS & shots", estimateHours: 12, metadata: { dependsOn: ["bug"] } });
  });
});

describe("deleting a card", () => {
  it("the client may delete any card they can see — imported or team-made — and it's soft", async () => {
    await deleteBoardCard(client, "forge");
    await deleteBoardCard(client, "teamcard");
    for (const id of ["forge", "teamcard"]) {
      const row = db.tasks.find((t) => t.id === id)!;
      expect(row.archivedAt).toBeInstanceOf(Date);
      expect(row.metadata).toMatchObject({ deletedFromBoard: { name: "Luke M.", side: "client" } });
    }
    expect(changes()).toEqual(["Luke M. deleted this card.", "Luke M. deleted this card."]);
  });

  it("never a team dev task", async () => {
    await expect(deleteBoardCard(client, "dev")).rejects.toMatchObject({ status: 404 });
    expect(db.tasks.find((t) => t.id === "dev")!.archivedAt).toBeNull();
  });

  it("a product card's dev tasks are unlinked, noted and kept — and come back on restore", async () => {
    await deleteBoardCard(client, "card");
    const dev = db.tasks.find((t) => t.id === "devlinked")!;
    expect(dev.archivedAt).toBeNull();
    expect(dev.productCardId).toBeNull();
    expect(db.comments).toEqual([expect.objectContaining({ taskId: "devlinked", body: expect.stringContaining("Luke M. deleted the card “Bag management”") })]);
    expect(spies.dispatch).toHaveBeenCalledWith(expect.objectContaining({ title: "Luke M. deleted “Bag management” from their board" }));

    await restoreBoardCard(team, "card");
    expect(db.tasks.find((t) => t.id === "card")!.archivedAt).toBeNull();
    expect(dev.productCardId).toBe("card");
    expect(changes().at(-1)).toBe("Dan restored this card.");
  });

  it("only a card deleted from the board can be restored", async () => {
    db.tasks.find((t) => t.id === "dev")!.archivedAt = new Date();
    await expect(restoreBoardCard(team, "dev")).rejects.toMatchObject({ status: 404 });
  });
});

describe("screenshots", () => {
  it("stores a real image, with a thumbnail, and records it", async () => {
    await addBoardCardImages(client, "card", [{ name: "a.png", bytes: png }]);
    expect(db.attachments).toHaveLength(1);
    expect(db.attachments[0]).toMatchObject({ taskId: "card", mime: "image/png", filename: "a.png" });
    expect(spies.consume).toHaveBeenCalledWith(expect.anything(), "w1", "upload", 1);
    expect(changes()).toEqual(["Luke M. added 1 screenshot."]);
  });

  it("an SVG (or anything else that isn't a picture) is refused, whatever it's called", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>');
    await expect(addBoardCardImages(client, "card", [{ name: "logo.png", bytes: svg }])).rejects.toMatchObject({ status: 400 });
    expect(db.attachments).toHaveLength(0);
  });

  it("past ten on a card is refused", async () => {
    db.attachments = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, taskId: "card" }));
    await expect(addBoardCardImages(client, "card", [{ name: "a.png", bytes: png }])).rejects.toMatchObject({ status: 400 });
  });

  it("never onto a team dev task", async () => {
    await expect(addBoardCardImages(client, "dev", [{ name: "a.png", bytes: png }])).rejects.toMatchObject({ status: 404 });
  });
});

/* ── Security review of PR #833 (Nov 2026) ─────────────────────────────────────────────── */

const prismaMock = async () => (await import("@/lib/prisma")).prisma as unknown as {
  task: { updateMany: ReturnType<typeof vi.fn> };
  taskAttachment: { count: ReturnType<typeof vi.fn> };
  taskComment: { createMany: ReturnType<typeof vi.fn> };
  taskClientFeedback: { findMany: ReturnType<typeof vi.fn> };
};

describe("what a client's write answers with", () => {
  beforeEach(() => {
    // The team made the card depend on one of its own dev tasks, and on a card.
    db.tasks.find((t) => t.id === "card")!.metadata = { dependsOn: ["dev", "bug"] };
  });

  it("never names a team dev task the card depends on — edit, no-op edit, move, upload, sub-item", async () => {
    const answers = [
      await updateBoardCard(client, "card", { title: "Bags v2" }),
      await updateBoardCard(client, "card", { priority: "MEDIUM" }),
      await moveBoardCard(client, "card", { laneKey: "DONE", orderKey: 1 }),
      await addBoardCardImages(client, "card", [{ name: "a.png", bytes: png }]),
      await createBoardCard(client, { title: "Sub", itemType: "subitem", laneKey: "col_ideas000", parentId: "card" }),
    ];
    for (const card of answers) {
      expect(card.id).toBe("card");
      expect(card.dependsOn.map((d) => d.id)).toEqual(["bug"]);
      expect(JSON.stringify(card)).not.toContain("Backend: rounds endpoint");
    }
  });

  it("the team's own copy still lists it", async () => {
    const card = await updateBoardCard(team, "card", { title: "Bags v2" });
    expect(card.dependsOn.map((d) => d.id).sort()).toEqual(["bug", "dev"]);
  });
});

describe("a client's dependency edit keeps the team's hidden links", () => {
  it("adds what the client chose to the dev tasks they can't see, rather than dropping them", async () => {
    db.tasks.find((t) => t.id === "card")!.metadata = { dependsOn: ["dev", "bug"] };
    await updateBoardCard(client, "card", { dependsOn: ["forge"] });
    expect((db.tasks.find((t) => t.id === "card")!.metadata as Row).dependsOn).toEqual(["forge", "dev"]);
  });

  it("re-sending what they can see is no change at all", async () => {
    db.tasks.find((t) => t.id === "card")!.metadata = { dependsOn: ["dev", "bug"] };
    await updateBoardCard(client, "card", { dependsOn: ["bug"] });
    expect(db.updateManyCalls).toHaveLength(0);
    expect(changes()).toHaveLength(0);
  });
});

describe("what a client's edits replaced, for the team", () => {
  it("keeps the old title and description on the change entry", async () => {
    db.tasks.find((t) => t.id === "card")!.description = "Old words";
    await updateBoardCard(client, "card", { title: "Bags v2", description: "New words" });
    expect(db.feedback.at(-1)).toMatchObject({ kind: "change", previous: { title: "Bag management", description: "Old words" } });
  });

  it("the team's own edits don't store one, and only the team reads it back", async () => {
    await updateBoardCard(team, "card", { title: "Team rename" });
    expect(db.feedback.at(-1)!.previous).toBeUndefined();
    const row = { id: "fb", kind: "change", body: "x", authorName: "Luke M.", authorWikiUserId: "wu1", authorUserId: null, createdAt: new Date(), previous: { title: "Old" } };
    const { taskClientFeedback } = await prismaMock();
    taskClientFeedback.findMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([row]);
    const [forClient] = await listBoardFeedback(client, "card");
    const [forTeam] = await listBoardFeedback(team, "card");
    expect(forClient.previous).toBeUndefined();
    expect(forTeam.previous).toEqual({ title: "Old" });
  });
});

describe("moves", () => {
  it("a client's move to another column is recorded on the card and taken from their quota", async () => {
    await moveBoardCard(client, "card", { laneKey: "DONE", orderKey: 1 });
    expect(changes()).toEqual(["Luke M. moved this to Done."]);
    expect(spies.consume).toHaveBeenCalledWith(expect.anything(), "w1", "move");
    // Moving within the same column is a reorder: nothing to record.
    await moveBoardCard(client, "card", { laneKey: "col_ideas000", orderKey: 2 });
    expect(changes()).toHaveLength(1);
  });

  it("over the move limit nothing moves", async () => {
    const tasks = await import("@/server/tasks");
    const move = vi.mocked(tasks.moveTaskForClient);
    move.mockClear();
    spies.consume.mockRejectedValueOnce(Object.assign(new Error("That would be more than 200 moves"), { status: 429 }));
    await expect(moveBoardCard(client, "card", { laneKey: "DONE", orderKey: 1 })).rejects.toMatchObject({ status: 429 });
    expect(move).not.toHaveBeenCalled();
  });
});

describe("deletes", () => {
  it("a client's delete is taken from their delete quota; over it, nothing is deleted", async () => {
    spies.consume.mockRejectedValueOnce(Object.assign(new Error("That would be more than 30 deleted cards"), { status: 429 }));
    await expect(deleteBoardCard(client, "card")).rejects.toMatchObject({ status: 429 });
    expect(db.tasks.find((t) => t.id === "card")!.archivedAt).toBeNull();
    await deleteBoardCard(client, "bug");
    expect(spies.consume).toHaveBeenLastCalledWith(expect.anything(), "w1", "delete");
  });

  it("is all or nothing: a failure part-way leaves the card, its links and its thread as they were", async () => {
    const { taskComment } = await prismaMock();
    taskComment.createMany.mockRejectedValueOnce(new Error("db down"));
    await expect(deleteBoardCard(client, "card")).rejects.toThrow("db down");
    expect(db.tasks.find((t) => t.id === "card")!.archivedAt).toBeNull();
    expect(db.tasks.find((t) => t.id === "devlinked")!.productCardId).toBe("card");
    expect(changes()).toHaveLength(0);
  });
});

describe("screenshots, all or nothing", () => {
  it("one file that isn't really an image stores nothing and counts nothing", async () => {
    // Passes the byte sniff (PNG signature), fails to decode.
    const fake = new Uint8Array([...png.subarray(0, 16), 1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(
      addBoardCardImages(client, "card", [
        { name: "good.png", bytes: png },
        { name: "bad.png", bytes: fake },
      ]),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.attachments).toHaveLength(0);
    expect(spies.consume).not.toHaveBeenCalled();
    expect(changes()).toHaveLength(0);
  });

  it("the card's room is counted again under the lock, so a parallel upload can't overfill it", async () => {
    const { taskAttachment } = await prismaMock();
    // 8 when first checked; 10 by the time the lock is held.
    taskAttachment.count.mockResolvedValueOnce(8).mockResolvedValueOnce(10);
    await expect(addBoardCardImages(client, "card", [{ name: "a.png", bytes: png }])).rejects.toMatchObject({ status: 400 });
    expect(db.attachments).toHaveLength(0);
    expect(spies.consume).not.toHaveBeenCalled();
  });

  it.each([7_000, 20_000])("an image declaring %i × %i pixels is refused from its header, before it is decoded", async (n) => {
    // 7,000² (49 MP) is under sharp's own default limit, so only the board's limit stops it.
    const bomb = Buffer.from(png);
    bomb.writeUInt32BE(n, 16); // IHDR width
    bomb.writeUInt32BE(n, 20); // IHDR height
    bomb.writeUInt32BE(crc32(bomb.subarray(12, 29)), 29); // keep the chunk valid
    await expect(addBoardCardImages(client, "card", [{ name: "huge.png", bytes: new Uint8Array(bomb) }])).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining(`${n} × ${n} pixels`),
    });
    expect(db.attachments).toHaveLength(0);
  });
});

describe("lists (the Table view's groups)", () => {
  it("a client puts a card in a list, and the thread says so in words", async () => {
    await updateBoardCard(client, "card", { list: "  QA   review " });
    expect(db.tasks.find((t) => t.id === "card")!.boardList).toBe("QA review");
    expect(changes()).toEqual(["Luke M. moved it to the list “QA review”."]);
  });

  it("clearing it takes the card off its list", async () => {
    db.tasks.find((t) => t.id === "card")!.boardList = "QA review";
    await updateBoardCard(client, "card", { list: null });
    expect(db.tasks.find((t) => t.id === "card")!.boardList).toBeNull();
    expect(changes()).toEqual(["Luke M. took it off its list."]);
  });

  it("a client's table cell on a team dev task is refused, and the task is untouched", async () => {
    await expect(updateBoardCard(client, "dev", { list: "Mine" })).rejects.toMatchObject({ status: 404 });
    expect(db.tasks.find((t) => t.id === "dev")!.boardList).toBeUndefined();
    expect(db.updateManyCalls).toHaveLength(0);
  });

  it("a card added with a list is stored in it", async () => {
    await createBoardCard(client, { title: "From a paste", itemType: "bug", laneKey: "col_ideas000", list: "QA review: 21 Nov" });
    expect(db.tasks.at(-1)).toMatchObject({ title: "From a paste", boardList: "QA review: 21 Nov" });
  });
});
