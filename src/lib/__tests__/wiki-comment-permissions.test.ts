/**
 * Who may edit or delete a reply on a client's request. The server enforces this on
 * every PATCH/DELETE and the thread uses it to decide which replies show the actions,
 * so a wrong answer here is either someone rewriting another person's words or the
 * owner unable to fix a typo.
 */
import { describe, expect, it } from "vitest";
import { commentPermissions, type CommentOwnership } from "../wiki-comment-permissions";

const teamReply: CommentOwnership = {
  authorKind: "TEAM",
  authorUserId: "u-harry",
  authorWikiUserId: null,
  deletedAt: null,
};
const clientReply: CommentOwnership = {
  authorKind: "CLIENT",
  authorUserId: null,
  authorWikiUserId: "wu-sam",
  deletedAt: null,
};

describe("commentPermissions — Gitwork users", () => {
  it("lets the author edit and delete their own reply", () => {
    expect(commentPermissions(teamReply, { kind: "team", userId: "u-harry", isAdmin: false })).toEqual({
      canEdit: true,
      canDelete: true,
    });
  });

  it("gives another teammate neither", () => {
    expect(commentPermissions(teamReply, { kind: "team", userId: "u-sam", isAdmin: false })).toEqual({
      canEdit: false,
      canDelete: false,
    });
  });

  it("lets an admin delete someone else's reply but never rewrite it", () => {
    expect(commentPermissions(teamReply, { kind: "team", userId: "u-admin", isAdmin: true })).toEqual({
      canEdit: false,
      canDelete: true,
    });
    expect(commentPermissions(clientReply, { kind: "team", userId: "u-admin", isAdmin: true })).toEqual({
      canEdit: false,
      canDelete: true,
    });
  });

  it("never treats a reply with no recorded author as anyone's", () => {
    const orphan = { ...teamReply, authorUserId: null };
    expect(commentPermissions(orphan, { kind: "team", userId: "", isAdmin: false }).canEdit).toBe(false);
  });
});

describe("commentPermissions — the client's side", () => {
  it("lets the wiki user who wrote it edit and delete it", () => {
    expect(commentPermissions(clientReply, { kind: "client", wikiUserId: "wu-sam" })).toEqual({
      canEdit: true,
      canDelete: true,
    });
  });

  it("gives a different wiki user neither — ownership is the id, not the name", () => {
    expect(commentPermissions(clientReply, { kind: "client", wikiUserId: "wu-other-sam" })).toEqual({
      canEdit: false,
      canDelete: false,
    });
  });

  it("never lets a client touch a Gitwork reply", () => {
    // Even if, somehow, the ids collided.
    const weird = { ...teamReply, authorWikiUserId: "wu-sam" };
    expect(commentPermissions(weird, { kind: "client", wikiUserId: "wu-sam" }).canEdit).toBe(false);
  });

  it("keeps an older client reply (no stamped owner) read-only", () => {
    const legacy = { ...clientReply, authorWikiUserId: null };
    expect(commentPermissions(legacy, { kind: "client", wikiUserId: "wu-sam" })).toEqual({
      canEdit: false,
      canDelete: false,
    });
  });
});

describe("commentPermissions — nobody", () => {
  it("gives an unidentified viewer nothing", () => {
    expect(commentPermissions(teamReply, null)).toEqual({ canEdit: false, canDelete: false });
  });

  it("gives nobody anything on a deleted reply, author and admin included", () => {
    const gone = { ...teamReply, deletedAt: new Date() };
    expect(commentPermissions(gone, { kind: "team", userId: "u-harry", isAdmin: true })).toEqual({
      canEdit: false,
      canDelete: false,
    });
  });
});
