/**
 * The reply writer itself (real wiki.ts, database mocked): a screenshot-only reply is
 * created with its image in the same row; a reply with neither text nor an image is
 * refused before anything is written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ creates: [] as { data: Record<string, unknown> }[] }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWikiIntakeItem: { findFirst: vi.fn(async () => ({ id: "i1", wikiId: "w1" })) },
    clientWikiIntakeComment: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        db.creates.push(args);
        return {
          id: "c-new",
          authorKind: args.data.authorKind,
          authorName: args.data.authorName,
          authorUserId: args.data.authorUserId ?? null,
          authorWikiUserId: null,
          body: args.data.body,
          mentions: args.data.mentions ?? null,
          createdAt: new Date(),
          editedAt: null,
          deletedAt: null,
          mime: args.data.mime ?? null,
          filename: args.data.filename ?? null,
        };
      }),
    },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
// The transcode is sharp's job; what matters here is that its output lands on the row.
vi.mock("sharp", () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    jpeg: () => chain,
    toBuffer: async () => Buffer.from("thumb"),
  };
  return { default: () => chain };
});

import { addWikiIntakeComment } from "../wiki";

const author = { userId: "u-harry", name: "Harry Brown", isAdmin: true };
const image = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mime: "image/png", filename: "shot.png" };

beforeEach(() => {
  db.creates.length = 0;
});

describe("addWikiIntakeComment", () => {
  it("creates a screenshot-only reply with its image in the same row", async () => {
    const out = await addWikiIntakeComment("acme", "i1", author, "  ", [{ id: "team:u-1", name: "Sam", kind: "TEAM" }], image);
    expect(out?.hasImage).toBe(true);
    expect(db.creates).toHaveLength(1);
    expect(db.creates[0].data).toMatchObject({ body: "", mime: "image/png", filename: "shot.png" });
    expect(db.creates[0].data.image).toBeDefined();
    // No text → nobody can have been mentioned in it.
    expect(db.creates[0].data.mentions).toBeUndefined();
  });

  it("refuses a reply with neither text nor an image, writing nothing", async () => {
    await expect(addWikiIntakeComment("acme", "i1", author, "   ")).rejects.toThrow(/empty/);
    expect(db.creates).toHaveLength(0);
  });

  it("writes a text reply with no image columns", async () => {
    await addWikiIntakeComment("acme", "i1", author, "Fixed");
    expect(db.creates[0].data.body).toBe("Fixed");
    expect(db.creates[0].data).not.toHaveProperty("image");
  });
});
