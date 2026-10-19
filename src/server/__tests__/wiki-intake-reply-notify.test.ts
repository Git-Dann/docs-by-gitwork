/**
 * The side-effect half of telling people about a reply: the in-app/push notification
 * for @mentioned team members, and the email to the client who raised the request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ wiki: null as Record<string, unknown> | null }));
const dispatch = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, id: "e1" })));

vi.mock("@/lib/prisma", () => ({
  prisma: { clientWiki: { findUnique: vi.fn(async () => db.wiki) } },
}));
vi.mock("@/server/notifications", () => ({ dispatchNotification: dispatch }));
vi.mock("@/server/email", () => ({ sendWorkspaceEmail: send }));

import { emailRaiserOnTeamReply, notifyTeamMentionsOnRequest } from "../wiki-intake-reply-notify";

beforeEach(() => {
  dispatch.mockClear();
  send.mockClear();
  db.wiki = {
    shareEnabled: true,
    shareToken: "tok",
    client: { id: "c1", slug: "northwind", name: "Northwind", workspaceId: "ws1" },
    wikiUsers: [
      { email: "ayesha@client.test", name: "Ayesha Khan" },
      { email: "dev@gitwork.co.uk", name: "Gitwork Dev" },
    ],
    intakeItems: [{ title: "Search <broken>", requestedBy: "Ayesha Khan" }],
  };
});

describe("notifyTeamMentionsOnRequest", () => {
  it("notifies the mentioned team members, linking to the internal wiki", async () => {
    const res = await notifyTeamMentionsOnRequest({
      wikiId: "w1",
      itemId: "i1",
      authorUserId: "u-harry",
      authorName: "Harry",
      body: "@Sam can you look?",
      mentions: [
        { id: "team:u-sam", name: "Sam", kind: "TEAM" },
        { id: "client:wu1", name: "Ayesha", kind: "CLIENT" },
      ],
    });
    expect(res.notified).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      event: "wiki.request_mention",
      workspaceId: "ws1",
      actorId: "u-harry",
      actionUrl: "/app/portal/northwind/wiki#intake",
      target: { kind: "users", userIds: ["u-sam"] },
    });
  });

  it("does not notify an author who mentioned only themselves", async () => {
    await notifyTeamMentionsOnRequest({
      wikiId: "w1",
      itemId: "i1",
      authorUserId: "u-harry",
      authorName: "Harry",
      body: "@Harry note to self",
      mentions: [{ id: "team:u-harry", name: "Harry", kind: "TEAM" }],
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("never throws into the caller", async () => {
    db.wiki = null;
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.clientWiki.findUnique).mockRejectedValueOnce(new Error("db down"));
    await expect(
      notifyTeamMentionsOnRequest({
        wikiId: "w1",
        itemId: "i1",
        authorUserId: null,
        authorName: "Client",
        body: "x",
        mentions: [{ id: "team:u-sam", name: "Sam", kind: "TEAM" }],
      }),
    ).resolves.toEqual({ notified: 0 });
  });
});

describe("emailRaiserOnTeamReply", () => {
  it("emails the wiki user who raised the request, with the shared link", async () => {
    const res = await emailRaiserOnTeamReply({ wikiId: "w1", itemId: "i1", authorName: "Harry", body: "Fixed." });
    expect(res.sent).toBe(true);
    const msg = (send.mock.calls[0] as unknown as [{ to: string; html: string; workspaceId: string }])[0];
    expect(msg.to).toBe("ayesha@client.test");
    expect(msg.workspaceId).toBe("ws1");
    expect(msg.html).toContain("/wiki/northwind/tok#intake");
    expect(msg.html).toContain("Search &lt;broken&gt;");
  });

  it("does not email a request raised by a Gitwork address", async () => {
    db.wiki = { ...db.wiki!, intakeItems: [{ title: "x", requestedBy: "Gitwork Dev" }] };
    const res = await emailRaiserOnTeamReply({ wikiId: "w1", itemId: "i1", authorName: "Harry", body: "x" });
    expect(res.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not link to the wiki when sharing is off", async () => {
    db.wiki = { ...db.wiki!, shareEnabled: false };
    await emailRaiserOnTeamReply({ wikiId: "w1", itemId: "i1", authorName: "Harry", body: "x" });
    const msg = (send.mock.calls[0] as unknown as [{ html: string }])[0];
    expect(msg.html).not.toContain("/wiki/");
  });
});
