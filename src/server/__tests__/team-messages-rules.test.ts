import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The rules that matter in team-messages.ts are expressed as Prisma `where` clauses, so
// they cannot be exercised without a database — and every one of them is a privacy or
// data-loss boundary that would regress silently. These assert the clauses directly.
//
// This is a source assertion, which is a weak form of test and is used here on purpose:
// the alternative is no coverage at all on the boundaries most worth protecting. Each
// one names the consequence, so a future change has to argue with the reason rather
// than just make the string match again.

const SOURCE = readFileSync("src/server/team-messages.ts", "utf8");

/** Strips line and block comments so an assertion reads code, not prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function body(fn: string): string {
  const start = SOURCE.indexOf(`export async function ${fn}`);
  expect(start, `${fn} no longer exists — update this test`).toBeGreaterThan(-1);
  const next = SOURCE.indexOf("\nexport ", start + 1);
  return SOURCE.slice(start, next === -1 ? undefined : next);
}

describe("who can read a message", () => {
  // ⚠️ A message addressed to two people is not workspace content. An admin bypass
  // here would make this a poor place to write anything candid, which is most of what
  // it is for.
  it("is limited to the author and its recipients — no admin bypass", () => {
    const fn = body("getTeamMessage");
    expect(fn).toContain("authorId: user.id");
    expect(fn).toContain("recipients: { some: { userId: user.id } }");
    expect(fn).not.toMatch(/isAtLeast|assertAtLeastAdmin|isSuperAdmin/);
  });

  it("scopes every read to the caller's workspace", () => {
    for (const fn of ["getTeamMessage", "listMyTeamMessages", "listSentTeamMessages"]) {
      expect(body(fn), `${fn} must scope by workspace`).toContain("workspaceId: user.workspaceId");
    }
  });
});

describe("removing a message", () => {
  // ⚠️ The distinction this whole pair exists for: a recipient clearing their own
  // inbox must not destroy a message addressed to four other people.
  it("a recipient DISMISSES — it updates their own row, it does not delete", () => {
    const fn = body("dismissTeamMessage");
    expect(fn).toContain("teamMessageRecipient.updateMany");
    expect(fn).toContain("userId: user.id");
    // Matched against the CODE, not the prose: the doc comment legitimately contains
    // the word "delete" while explaining why this is not one.
    expect(stripComments(fn)).not.toMatch(/\.delete\(|deleteMany/);
  });

  it("an author DELETES — and only their own message", () => {
    const fn = body("deleteTeamMessage");
    expect(fn).toContain("teamMessage.deleteMany");
    expect(fn).toContain("authorId: user.id");
    expect(fn).toContain("workspaceId: user.workspaceId");
  });

  it("a dismissed message leaves that person's list and nobody else's", () => {
    expect(body("listMyTeamMessages")).toContain("dismissedAt: null");
    // The author's view is unaffected — receipts must stay truthful.
    expect(body("listSentTeamMessages")).not.toContain("dismissedAt");
  });
});

describe("read state", () => {
  it("marking read never moves an existing timestamp", () => {
    // `readAt: null` in the filter is what makes first-read the recorded fact.
    expect(body("markTeamMessageRead")).toContain("readAt: null");
  });

  it("marking unread clears it for this person only", () => {
    const fn = body("markTeamMessageUnread");
    expect(fn).toContain("userId: user.id");
    expect(fn).toContain("data: { readAt: null }");
  });

  it("mark-all is scoped to this person, this workspace, and skips dismissed", () => {
    const fn = body("markAllTeamMessagesRead");
    expect(fn).toContain("userId: user.id");
    expect(fn).toContain("workspaceId: user.workspaceId");
    expect(fn).toContain("dismissedAt: null");
  });
});

describe("sending", () => {
  // ⚠️ A push cannot be recalled, so two taps on Send is two alerts on someone's phone
  // for one message and the recipient cannot tell it was an accident.
  it("guards against a double submit", () => {
    const fn = body("sendTeamMessage");
    expect(fn).toContain("createdAt: { gte:");
    expect(fn).toContain("if (duplicate) return");
  });

  it("only writes recipient rows for real workspace members", () => {
    const fn = body("sendTeamMessage");
    expect(fn).toContain("workspaceMember.findMany");
    expect(fn).toContain("workspaceId: user.workspaceId");
  });

  // Addressing yourself is a choice, not a slip — it is how you check your own wording
  // before sending it to someone else.
  it("honours the author addressing themselves", () => {
    const fn = body("sendTeamMessage");
    expect(fn).toContain("includesSelf");
    expect(fn).toContain("actorId: includesSelf ? null : user.id");
  });

  it("sending requires admin, reading does not", () => {
    expect(body("sendTeamMessage")).toContain("assertAtLeastAdmin");
    expect(body("listMyTeamMessages")).not.toContain("assertAtLeastAdmin");
  });
});
