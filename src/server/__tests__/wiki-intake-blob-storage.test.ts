/**
 * Request and reply screenshots through the upload storage abstraction — against the
 * real wiki.ts functions, with the database mocked and an in-memory bucket.
 *
 * The rules: the default driver changes nothing (bytes stay in image/thumb); with
 * object storage the row holds only `storageKey`; reads follow the row, not the
 * driver, so old rows keep working; and anything that removes a screenshot removes
 * its object too.
 */
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  item: null as Row | null,
  comments: [] as Row[],
  itemUpdates: [] as Row[],
  commentUpdates: [] as Row[],
  attachments: [] as Row[],
  deletedItems: [] as string[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWikiIntakeItem: {
      findFirst: vi.fn(async () => (db.item ? { ...db.item } : null)),
      findUnique: vi.fn(async () => (db.item ? { ...db.item } : null)),
      update: vi.fn(async (args: { data: Row }) => {
        db.itemUpdates.push(args.data);
        Object.assign(db.item!, args.data);
        return db.item;
      }),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        db.deletedItems.push(args.where.id);
        return db.item;
      }),
    },
    clientWikiIntakeComment: {
      findFirst: vi.fn(async () => (db.comments[0] ? { ...db.comments[0] } : null)),
      findUnique: vi.fn(async () => (db.comments[0] ? { ...db.comments[0] } : null)),
      findMany: vi.fn(async () => db.comments.filter((c) => c.storageKey)),
      update: vi.fn(async (args: { data: Row }) => {
        db.commentUpdates.push(args.data);
        Object.assign(db.comments[0], args.data);
        return db.comments[0];
      }),
    },
    task: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "t1" })),
    },
    taskAttachment: {
      create: vi.fn(async (args: { data: Row }) => {
        db.attachments.push(args.data);
        return { id: "a1" };
      }),
    },
    clientWiki: { findFirst: vi.fn(async () => ({ id: "w1" })), findUnique: vi.fn(async () => null) },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("../wiki-intake-webhook", () => ({ deliverIntakeWebhook: vi.fn(async () => {}) }));

import { __setBlobStoreForTests, thumbKeyOf, type BlobStore } from "../blob-storage";
import {
  attachWikiIntakeItemImage,
  deleteWikiIntakeComment,
  deleteWikiIntakeItem,
  getWikiIntakeCommentImageBytes,
  getWikiIntakeItemImageBytes,
  promoteWikiIntakeItemToTask,
} from "../wiki";

let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#1D4ED8" } }).png().toBuffer();
});

function bucket(): BlobStore & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    put: async (k, b) => void objects.set(k, Buffer.from(b)),
    get: async (k) => objects.get(k) ?? null,
    delete: async (k) => void objects.delete(k),
  };
}

function itemRow(over: Row = {}): Row {
  const now = new Date("2026-10-01T10:00:00Z");
  return {
    id: "i1",
    wikiId: "w1",
    type: "BUG",
    title: "Crash",
    description: null,
    priority: "MEDIUM",
    status: "NEW",
    requestedBy: null,
    externalRef: null,
    taskId: null,
    source: null,
    image: null,
    thumb: null,
    mime: null,
    filename: null,
    storageKey: null,
    createdAt: now,
    updatedAt: now,
    wiki: { client: { id: "c1", workspaceId: "ws1", slug: "acme", name: "Acme" } },
    ...over,
  };
}

beforeEach(() => {
  db.item = itemRow();
  db.comments = [];
  db.itemUpdates = [];
  db.commentUpdates = [];
  db.attachments = [];
  db.deletedItems = [];
  __setBlobStoreForTests({ driver: "postgres", store: null });
});

afterEach(() => __setBlobStoreForTests(null));

describe("request screenshots", () => {
  it("default driver: bytes in image/thumb, no key — unchanged behaviour", async () => {
    await attachWikiIntakeItemImage("c1", "i1", PNG, "image/png", "shot.png");
    const data = db.itemUpdates[0];
    expect(data.storageKey).toBeNull();
    expect(Buffer.from(data.image as Uint8Array)).toEqual(PNG);
    expect(data.thumb).toBeTruthy();
    expect(data.mime).toBe("image/png");

    const full = await getWikiIntakeItemImageBytes("c1", "i1");
    expect(full).toEqual({ bytes: PNG, mime: "image/png" });
    const thumb = await getWikiIntakeItemImageBytes("c1", "i1", "thumb");
    expect(thumb!.mime).toBe("image/jpeg");
  });

  it("object storage: row holds only the key; both objects are in the bucket and serve back", async () => {
    const store = bucket();
    __setBlobStoreForTests({ driver: "s3", store });
    await attachWikiIntakeItemImage("c1", "i1", PNG, "image/png", "shot.png");
    const data = db.itemUpdates[0];
    expect(data.image).toBeNull();
    expect(data.thumb).toBeNull();
    const key = data.storageKey as string;
    expect(key).toMatch(/^wiki-intake-item\/i1\//);
    expect(store.objects.get(key)).toEqual(PNG);
    expect(store.objects.has(thumbKeyOf(key))).toBe(true);

    expect(await getWikiIntakeItemImageBytes("c1", "i1")).toEqual({ bytes: PNG, mime: "image/png" });
    const thumb = await getWikiIntakeItemImageBytes("c1", "i1", "thumb");
    expect(thumb!.bytes).toEqual(store.objects.get(thumbKeyOf(key)));
  });

  it("replacing a screenshot deletes the old object, never the new one", async () => {
    const store = bucket();
    __setBlobStoreForTests({ driver: "s3", store });
    await attachWikiIntakeItemImage("c1", "i1", PNG, "image/png", "a.png");
    const first = db.item!.storageKey as string;
    await attachWikiIntakeItemImage("c1", "i1", PNG, "image/png", "b.png");
    const second = db.item!.storageKey as string;
    expect(second).not.toBe(first);
    expect(store.objects.has(first)).toBe(false);
    expect(store.objects.has(second)).toBe(true);
  });

  it("an old column row still serves after switching to object storage", async () => {
    db.item = itemRow({ image: PNG, thumb: null, mime: "image/png" });
    __setBlobStoreForTests({ driver: "s3", store: bucket() });
    expect(await getWikiIntakeItemImageBytes("c1", "i1")).toEqual({ bytes: PNG, mime: "image/png" });
  });

  it("deleting a request deletes its own and its replies' objects", async () => {
    const store = bucket();
    for (const k of ["k-item", "k-reply"]) {
      store.objects.set(k, PNG);
      store.objects.set(thumbKeyOf(k), PNG);
    }
    store.objects.set("unrelated", PNG);
    db.item = itemRow({ storageKey: "k-item", mime: "image/png" });
    db.comments = [{ id: "c1", storageKey: "k-reply" }];
    __setBlobStoreForTests({ driver: "s3", store });
    await deleteWikiIntakeItem("i1");
    expect(db.deletedItems).toEqual(["i1"]);
    expect([...store.objects.keys()]).toEqual(["unrelated"]);
  });

  it("promoting copies a bucket-stored screenshot into the task attachment's columns", async () => {
    const store = bucket();
    store.objects.set("k", PNG);
    store.objects.set(thumbKeyOf("k"), Buffer.from([1, 2, 3]));
    db.item = itemRow({ storageKey: "k", mime: "image/png", filename: "s.png" });
    __setBlobStoreForTests({ driver: "s3", store });
    await promoteWikiIntakeItemToTask("i1", "u1");
    expect(db.attachments).toHaveLength(1);
    expect(Buffer.from(db.attachments[0].image as Uint8Array)).toEqual(PNG);
    expect(Buffer.from(db.attachments[0].thumb as Uint8Array)).toEqual(Buffer.from([1, 2, 3]));
    // The task holds its own copy, so the request's object is untouched.
    expect(store.objects.has("k")).toBe(true);
  });
});

describe("reply screenshots", () => {
  function reply(over: Row = {}): Row {
    return {
      id: "r1",
      authorKind: "TEAM",
      authorName: "Harry",
      authorUserId: "u1",
      authorWikiUserId: null,
      body: "see shot",
      mentions: null,
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
      mime: "image/png",
      filename: "s.png",
      image: null,
      thumb: null,
      storageKey: "k-reply",
      intakeItem: { wikiId: "w1" },
      ...over,
    };
  }

  it("serves a bucket-stored reply screenshot", async () => {
    const store = bucket();
    store.objects.set("k-reply", PNG);
    db.comments = [reply()];
    __setBlobStoreForTests({ driver: "postgres", store });
    expect(await getWikiIntakeCommentImageBytes({ slug: "acme" }, "i1", "r1")).toEqual({
      bytes: PNG,
      mime: "image/png",
    });
  });

  it("deleting a reply clears the key and removes the object", async () => {
    const store = bucket();
    store.objects.set("k-reply", PNG);
    store.objects.set(thumbKeyOf("k-reply"), PNG);
    db.comments = [reply()];
    __setBlobStoreForTests({ driver: "s3", store });
    await deleteWikiIntakeComment({ slug: "acme" }, "i1", "r1", {
      kind: "team",
      userId: "u1",
      isAdmin: false,
    } as never);
    expect(db.commentUpdates[0]).toMatchObject({ storageKey: null, image: null, thumb: null });
    expect(store.objects.size).toBe(0);
  });
});
