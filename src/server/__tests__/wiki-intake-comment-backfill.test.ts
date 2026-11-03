/**
 * Tying old client replies to their author — conservatively.
 *
 * The match is exact (trimmed, case-insensitive) on name or email, within ONE wiki,
 * and only when exactly one user fits. Anything ambiguous stays null, so the reply
 * stays read-only rather than becoming editable by the wrong person.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchCommentAuthor, type WikiUserForMatch } from "@/lib/wiki-comment-author-match";

const users: WikiUserForMatch[] = [
  { id: "wu-ayesha", wikiId: "w1", name: "Ayesha Khan", email: "ayesha@acme.com" },
  { id: "wu-sam-1", wikiId: "w1", name: "Sam", email: "sam.one@acme.com" },
  { id: "wu-sam-2", wikiId: "w1", name: "sam ", email: "sam.two@acme.com" },
  { id: "wu-noname", wikiId: "w1", name: null, email: "ops@acme.com" },
  { id: "wu-other-wiki", wikiId: "w2", name: "Marcus Webb", email: "marcus@other.com" },
];

describe("matchCommentAuthor", () => {
  it("matches an exact name, ignoring case and surrounding spaces", () => {
    expect(matchCommentAuthor("  ayesha KHAN ", "w1", users)).toBe("wu-ayesha");
  });

  it("matches an email (a wiki user with no name is shown by their email)", () => {
    expect(matchCommentAuthor("OPS@acme.com", "w1", users)).toBe("wu-noname");
  });

  it("leaves an ambiguous name alone — two wiki users are called Sam", () => {
    expect(matchCommentAuthor("Sam", "w1", users)).toBeNull();
  });

  it("refuses when one user's name is another user's email", () => {
    const clash: WikiUserForMatch[] = [
      { id: "a", wikiId: "w1", name: "lee@acme.com", email: "x@acme.com" },
      { id: "b", wikiId: "w1", name: "Lee", email: "lee@acme.com" },
    ];
    expect(matchCommentAuthor("lee@acme.com", "w1", clash)).toBeNull();
  });

  it("never matches a user from another wiki", () => {
    expect(matchCommentAuthor("Marcus Webb", "w1", users)).toBeNull();
    expect(matchCommentAuthor("Marcus Webb", "w2", users)).toBe("wu-other-wiki");
  });

  it("does not match on a partial name", () => {
    expect(matchCommentAuthor("Ayesha", "w1", users)).toBeNull();
  });

  it("does not match a blank or generic author", () => {
    expect(matchCommentAuthor("   ", "w1", users)).toBeNull();
    expect(matchCommentAuthor("Client wiki", "w1", users)).toBeNull();
  });
});

const db = vi.hoisted(() => ({
  rows: [] as { id: string; authorName: string }[],
  users: [] as WikiUserForMatch[],
  findWhere: null as unknown,
  updates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWikiIntakeComment: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        db.findWhere = args.where;
        return db.rows;
      }),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        db.updates.push(args);
        return { count: 1 };
      }),
    },
    clientWikiUser: { findMany: vi.fn(async () => db.users) },
  },
}));

import { AUTHOR_STAMPING_SHIPPED, backfillCommentAuthors } from "../wiki-intake-comment-backfill";

describe("backfillCommentAuthors", () => {
  beforeEach(() => {
    db.rows = [];
    db.users = users.filter((u) => u.wikiId === "w1");
    db.findWhere = null;
    db.updates = [];
  });

  it("only looks at this wiki's unstamped client replies from before stamping shipped", async () => {
    await backfillCommentAuthors("w1");
    expect(db.findWhere).toMatchObject({
      authorKind: "CLIENT",
      authorWikiUserId: null,
      createdAt: { lt: AUTHOR_STAMPING_SHIPPED },
      intakeItem: { wikiId: "w1" },
    });
  });

  it("stamps unambiguous replies and leaves ambiguous ones null", async () => {
    db.rows = [
      { id: "c-ayesha", authorName: "Ayesha Khan" },
      { id: "c-sam", authorName: "Sam" },
      { id: "c-unknown", authorName: "Someone Else" },
    ];
    const out = await backfillCommentAuthors("w1");
    expect(out).toEqual({ examined: 3, stamped: 1 });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).toEqual({
      where: { id: "c-ayesha", authorWikiUserId: null, authorKind: "CLIENT" },
      data: { authorWikiUserId: "wu-ayesha" },
    });
  });

  it("costs one read and writes nothing once a wiki has no unstamped replies", async () => {
    const out = await backfillCommentAuthors("w1");
    expect(out).toEqual({ examined: 0, stamped: 0 });
    expect(db.updates).toHaveLength(0);
  });
});

describe("where the backfill runs", () => {
  it("runs on the shared wiki page BEFORE permissions are decided", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/wiki/[slug]/[token]/page.tsx", "utf8");
    const backfill = page.indexOf("await backfillCommentAuthors(resolved.wiki.id)");
    const permissions = page.indexOf("await applyCommentViewer(");
    expect(backfill).toBeGreaterThan(-1);
    expect(backfill).toBeLessThan(permissions);
  });
});
