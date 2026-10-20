/**
 * Who can be @mentioned on a client's requests, and the Slack Connect post.
 *
 * Two rules matter most: the client's side can only page people it can see (never the
 * whole staff list, never by guessing an id), and nothing reaches Slack without a
 * shared channel to post it in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  wiki: null as Record<string, unknown> | null,
  members: [] as { user: { id: string; name: string | null; email: string } }[],
  memberWhere: null as unknown,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWiki: { findUnique: vi.fn(async () => db.wiki) },
    clientAssignment: { findMany: vi.fn(async () => [{ userId: "u-dev" }]) },
    placement: { findMany: vi.fn(async () => [{ candidate: { email: "Placed@Gitwork.co.uk" } }]) },
    clientWikiIntakeComment: { findMany: vi.fn(async () => []) },
    workspaceMember: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        db.memberWhere = args.where;
        return db.members;
      }),
    },
  },
}));
const post = vi.hoisted(() => vi.fn());
vi.mock("@/server/slack/client", () => ({
  getSlackBotToken: (ws: { slackBotToken?: string | null } | null | undefined) => ws?.slackBotToken ?? null,
  postMessage: post,
}));

import {
  listMentionables,
  notifyIntakeMentions,
  resolveMentions,
  sheetPeopleDirectory,
  sheetPeopleForBrowser,
} from "../wiki-intake-mentions";

const WIKI = {
  clientId: "c1",
  client: { workspaceId: "w1", primaryContactName: "Javed Iqbal", primaryContactEmail: "javed@client.test" },
  wikiUsers: [{ id: "wu1", name: "Ayesha Khan", email: "ayesha@client.test" }],
};

beforeEach(() => {
  db.wiki = WIKI;
  db.members = [
    { user: { id: "u-dev", name: "Mustaqeem bin Ahmed", email: "m@gitwork.co.uk" } },
    { user: { id: "u-harry", name: "Harry Brown", email: "harry@gitwork.co.uk" } },
  ];
  post.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      json: async () =>
        url.includes("harry%40gitwork.co.uk") ? { ok: true, user: { id: "UHARRY" } } : { ok: false },
    })),
  );
});

describe("listMentionables", () => {
  it("lists the client's people first, then the team, with no emails", async () => {
    const people = await listMentionables("wiki1", "internal");
    expect(people.map((p) => p.name)).toEqual([
      "Ayesha Khan",
      "Javed Iqbal",
      "Harry Brown",
      "Mustaqeem bin Ahmed",
    ]);
    expect(JSON.stringify(people)).not.toContain("@");
  });

  it("does not add the primary contact twice when they already have a wiki login", async () => {
    db.wiki = { ...WIKI, wikiUsers: [{ id: "wu2", name: "Javed", email: "JAVED@client.test" }] };
    const people = await listMentionables("wiki1", "internal");
    expect(people.filter((p) => p.kind === "CLIENT")).toHaveLength(1);
  });

  it("narrows the team on the client's side to admins + people involved", async () => {
    await listMentionables("wiki1", "public");
    expect(JSON.stringify(db.memberWhere)).toContain("ADMIN");
    expect(JSON.stringify(db.memberWhere)).toContain("u-dev");
    await listMentionables("wiki1", "internal");
    expect(JSON.stringify(db.memberWhere)).not.toContain("ADMIN");
  });

  it("only ever lists active members", async () => {
    await listMentionables("wiki1", "internal");
    expect(db.memberWhere).toMatchObject({ archivedAt: null });
  });
});

describe("resolveMentions", () => {
  it("drops ids that aren't in this wiki's directory — no paging by guessing", async () => {
    const out = await resolveMentions("wiki1", "public", ["team:u-dev", "team:u-ceo", "client:wu1"]);
    expect(out.map((m) => m.id)).toEqual(["team:u-dev", "client:wu1"]);
  });
});

describe("notifyIntakeMentions", () => {
  const WITH_SLACK = {
    shareEnabled: true,
    shareToken: "tok",
    client: {
      slug: "polleniq",
      slackExternalChannelId: "C-EXT",
      workspace: { slackBotToken: "xoxb", slackBotTokenEncrypted: null },
    },
    intakeItems: [{ title: "Dwell time" }],
  };

  it("posts to the client's shared channel, pinging people found in Slack", async () => {
    db.wiki = WITH_SLACK;
    post.mockResolvedValue({ ok: true });
    const res = await notifyIntakeMentions({
      wikiId: "wiki1",
      itemId: "i1",
      author: "Javed",
      body: "please check",
      mentions: [
        { id: "team:u-harry", name: "Harry Brown", kind: "TEAM", email: "harry@gitwork.co.uk" },
        { id: "team:u-dev", name: "Mustaqeem bin Ahmed", kind: "TEAM", email: "m@gitwork.co.uk" },
      ],
    });
    expect(res.posted).toBe(true);
    const [, input] = post.mock.calls[0];
    expect(input.channel).toBe("C-EXT");
    expect(input.text).toContain("<@UHARRY>");
    expect(input.text).toContain("*Mustaqeem bin Ahmed*");
    // Linked to the page the CLIENT can open, never an /app URL.
    expect(input.text).toContain("/wiki/polleniq/tok#intake");
    expect(input.text).not.toContain("/app/");
  });

  it("posts nothing without a shared channel", async () => {
    db.wiki = { ...WITH_SLACK, client: { ...WITH_SLACK.client, slackExternalChannelId: null } };
    const res = await notifyIntakeMentions({
      wikiId: "wiki1",
      itemId: "i1",
      author: "Javed",
      body: "x",
      mentions: [{ id: "team:u-harry", name: "Harry Brown", kind: "TEAM", email: null }],
    });
    expect(res.posted).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("posts nothing when nobody was mentioned", async () => {
    db.wiki = WITH_SLACK;
    await notifyIntakeMentions({ wikiId: "wiki1", itemId: "i1", author: "J", body: "x", mentions: [] });
    expect(post).not.toHaveBeenCalled();
  });

  it("never throws when Slack fails — the reply is already saved", async () => {
    db.wiki = WITH_SLACK;
    post.mockRejectedValue(new Error("down"));
    await expect(
      notifyIntakeMentions({
        wikiId: "wiki1",
        itemId: "i1",
        author: "J",
        body: "x",
        mentions: [{ id: "team:u-harry", name: "Harry Brown", kind: "TEAM", email: null }],
      }),
    ).resolves.toEqual({ posted: false, reason: "error" });
  });
});

describe("the Sheets person directory (§73.1)", () => {
  it("the team's side is limited to members who can SEE this client, and only active ones", async () => {
    await sheetPeopleDirectory({ clientId: "c1" }, "team");
    const where = JSON.stringify(db.memberWhere);
    expect(where).toContain('"archivedAt":null'); // ACTIVE_MEMBER — an archived leaver is never offered
    expect(where).toContain('"role":"SUPER_ADMIN"');
    expect(where).toContain('"array_contains":["seeAllClients"]');
    expect(where).toContain('"in":["u-dev"]'); // assigned to this client
    expect(where).toContain("placed@gitwork.co.uk"); // placed on it in Code, matched by email
  });

  it("the client's side is the mention picker's restricted list, never the whole team", async () => {
    await sheetPeopleDirectory({ wikiId: "wiki-1" }, "client");
    const where = JSON.stringify(db.memberWhere);
    expect(where).toContain('"role":{"in":["SUPER_ADMIN","ADMIN"]}');
    expect(where).not.toContain("seeAllClients");
  });

  it("the browser gets ids and names, never emails", async () => {
    const people = sheetPeopleForBrowser(await sheetPeopleDirectory({ clientId: "c1" }, "team"));
    expect(JSON.stringify(people)).not.toMatch(/@/);
    expect(people.map((p) => p.id)).toContain("client:wu1");
  });
});
