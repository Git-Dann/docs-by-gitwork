/**
 * Editing, deleting and reading back replies on a client's request — against the real
 * wiki.ts functions with the database mocked.
 *
 * The rules that matter: only the author may edit (an admin may delete, not rewrite);
 * a deleted reply's text never leaves the server; and the delete really clears the
 * stored text and screenshot rather than hiding them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  authorKind: "TEAM" | "CLIENT";
  authorName: string;
  authorUserId: string | null;
  authorWikiUserId: string | null;
  body: string;
  mentions: unknown;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  mime: string | null;
  filename: string | null;
  intakeItem: { wikiId: string };
};

const db = vi.hoisted(() => ({
  row: null as Row | null,
  updates: [] as { where: unknown; data: Record<string, unknown> }[],
  owners: [] as unknown[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWikiIntakeComment: {
      findFirst: vi.fn(async () => db.row),
      findMany: vi.fn(async () => db.owners),
      update: vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
        db.updates.push(args);
        return { ...db.row, ...args.data };
      }),
    },
    clientWiki: { findFirst: vi.fn(async () => ({ id: "w1" })), findUnique: vi.fn(async () => null) },
  },
}));

// wiki.ts reaches the NextAuth config through its notification/access imports; none
// of it runs here, so stub the edge-only module rather than loading it under Node.
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

import {
  CommentForbiddenError,
  applyCommentViewer,
  deleteWikiIntakeComment,
  editWikiIntakeComment,
  serializeWikiIntakeComment,
  type WikiIntakeItemRecord,
} from "../wiki";

const AT = new Date("2026-10-01T10:00:00Z");

function teamRow(over: Partial<Row> = {}): Row {
  return {
    id: "c1",
    authorKind: "TEAM",
    authorName: "Harry Brown",
    authorUserId: "u-harry",
    authorWikiUserId: null,
    body: "Original text",
    mentions: null,
    createdAt: AT,
    editedAt: null,
    deletedAt: null,
    mime: "image/png",
    filename: "shot.png",
    intakeItem: { wikiId: "w1" },
    ...over,
  };
}

beforeEach(() => {
  db.row = teamRow();
  db.updates = [];
  db.owners = [];
});

describe("editWikiIntakeComment", () => {
  it("lets the author edit, and stamps editedAt", async () => {
    const out = await editWikiIntakeComment(
      { slug: "northwind" },
      "i1",
      "c1",
      { kind: "team", userId: "u-harry", isAdmin: false },
      "  New text ",
    );
    expect(db.updates[0].data.body).toBe("New text");
    expect(db.updates[0].data.editedAt).toBeInstanceOf(Date);
    expect(out?.body).toBe("New text");
    expect(out?.editedAt).not.toBeNull();
    expect(out?.canEdit).toBe(true);
  });

  it("refuses someone who isn't the author — admin included — and writes nothing", async () => {
    await expect(
      editWikiIntakeComment({ slug: "northwind" }, "i1", "c1", { kind: "team", userId: "u-admin", isAdmin: true }, "x"),
    ).rejects.toBeInstanceOf(CommentForbiddenError);
    await expect(
      editWikiIntakeComment({ slug: "northwind" }, "i1", "c1", null, "x"),
    ).rejects.toBeInstanceOf(CommentForbiddenError);
    expect(db.updates).toHaveLength(0);
  });

  it("refuses a client editing a reply by a different wiki user with the same name", async () => {
    db.row = teamRow({ authorKind: "CLIENT", authorUserId: null, authorWikiUserId: "wu-sam-1", authorName: "Sam" });
    await expect(
      editWikiIntakeComment({ token: "tok" }, "i1", "c1", { kind: "client", wikiUserId: "wu-sam-2" }, "x"),
    ).rejects.toBeInstanceOf(CommentForbiddenError);
  });

  it("404s (null) for a reply that isn't in this wiki", async () => {
    db.row = null;
    expect(
      await editWikiIntakeComment({ slug: "other" }, "i1", "c1", { kind: "team", userId: "u-harry", isAdmin: false }, "x"),
    ).toBeNull();
  });
});

describe("deleteWikiIntakeComment", () => {
  it("soft-deletes: stamps deletedAt and clears the text, mentions and screenshot", async () => {
    const out = await deleteWikiIntakeComment({ slug: "northwind" }, "i1", "c1", {
      kind: "team",
      userId: "u-harry",
      isAdmin: false,
    });
    const data = db.updates[0].data;
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.body).toBe("");
    expect(data.image).toBeNull();
    expect(data.thumb).toBeNull();
    expect(data.mime).toBeNull();
    expect(out).toMatchObject({ deleted: true, body: "", hasImage: false, canEdit: false, canDelete: false });
  });

  it("lets an admin delete someone else's reply", async () => {
    const out = await deleteWikiIntakeComment({ slug: "northwind" }, "i1", "c1", {
      kind: "team",
      userId: "u-admin",
      isAdmin: true,
    });
    expect(out?.deleted).toBe(true);
  });

  it("refuses a non-author, non-admin", async () => {
    await expect(
      deleteWikiIntakeComment({ slug: "northwind" }, "i1", "c1", { kind: "team", userId: "u-sam", isAdmin: false }),
    ).rejects.toBeInstanceOf(CommentForbiddenError);
    expect(db.updates).toHaveLength(0);
  });
});

describe("applyCommentViewer — a deleted reply never ships its text", () => {
  function itemWith(comments: WikiIntakeItemRecord["comments"]): { intakeItems: WikiIntakeItemRecord[] } {
    return { intakeItems: [{ id: "i1", comments } as WikiIntakeItemRecord] };
  }

  it("marks only the viewer's own replies editable", async () => {
    db.owners = [
      { id: "c1", authorKind: "TEAM", authorUserId: "u-harry", authorWikiUserId: null, deletedAt: null },
      { id: "c2", authorKind: "TEAM", authorUserId: "u-sam", authorWikiUserId: null, deletedAt: null },
    ];
    const base = {
      authorKind: "TEAM" as const,
      authorName: "x",
      body: "b",
      mentions: [],
      createdAt: AT.toISOString(),
      editedAt: null,
      deleted: false,
      hasImage: false,
      imageFilename: null,
      canEdit: false,
      canDelete: false,
    };
    const out = await applyCommentViewer(itemWith([{ ...base, id: "c1" }, { ...base, id: "c2" }]), {
      kind: "team",
      userId: "u-harry",
      isAdmin: false,
    });
    expect(out.intakeItems[0].comments.map((c) => [c.id, c.canEdit, c.canDelete])).toEqual([
      ["c1", true, true],
      ["c2", false, false],
    ]);
  });
});

describe("serializeWikiIntakeComment", () => {
  it("never ships a deleted reply's text, mentions or screenshot — even if the row still holds them", () => {
    const out = serializeWikiIntakeComment({
      ...teamRow({ deletedAt: AT, editedAt: AT }),
      body: "secret that should be gone",
      mentions: [{ id: "team:u-sam", name: "Sam", kind: "TEAM" }],
    });
    expect(out).toMatchObject({
      deleted: true,
      body: "",
      mentions: [],
      hasImage: false,
      imageFilename: null,
      editedAt: null,
    });
    expect(JSON.stringify(out)).not.toContain("secret");
  });

  it("reports an attached screenshot and an edit on a live reply", () => {
    const out = serializeWikiIntakeComment(teamRow({ editedAt: AT }));
    expect(out).toMatchObject({
      deleted: false,
      hasImage: true,
      imageFilename: "shot.png",
      editedAt: AT.toISOString(),
    });
  });
});
