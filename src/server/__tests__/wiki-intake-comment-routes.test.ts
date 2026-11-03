/**
 * The public reply route decides who wrote a reply, and from that who hears about it.
 * A client replying on their own request must email nobody; a Gitwork user previewing
 * the page is a Gitwork reply and emails the raiser. Both stamp who wrote it, so they
 * can edit it later.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  clientUser: null as null | { id: string; displayName: string },
  staff: null as null | { user: { id: string; name: string } },
}));
const addByToken = vi.hoisted(() =>
  vi.fn(async (_t: string, _i: string, input: { body: string }) => ({ id: "c-new", body: input.body })),
);
const emailRaiser = vi.hoisted(() => vi.fn(async () => ({ sent: true })));
const notifyTeam = vi.hoisted(() => vi.fn(async () => ({ notified: 0 })));

vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  // Run deferred work immediately so the test can see what was scheduled.
  return { ...actual, after: (fn: () => unknown) => void fn() };
});
vi.mock("@/server/wiki", () => ({
  resolveWikiIdByPublicToken: vi.fn(async () => "w1"),
  addWikiIntakeCommentByToken: addByToken,
}));
vi.mock("@/server/wiki-access", () => ({
  resolveWikiAccessUser: vi.fn(async () => state.clientUser),
  wikiAccessCookieName: () => "wiki_access_w1",
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => state.staff) }));
vi.mock("@/server/wiki-intake-mentions", () => ({
  resolveMentions: vi.fn(async () => []),
  notifyIntakeMentions: vi.fn(async () => ({ posted: false })),
}));
vi.mock("@/server/wiki-intake-reply-notify", () => ({
  emailRaiserOnTeamReply: emailRaiser,
  notifyTeamMentionsOnRequest: notifyTeam,
}));

import { POST } from "@/app/api/wiki/[token]/intake-items/[id]/comments/route";

function call() {
  const req = new NextRequest("http://x/api/wiki/tok/intake-items/i1/comments", {
    method: "POST",
    body: JSON.stringify({ body: "Thanks!" }),
    headers: { "content-type": "application/json" },
  });
  return POST(req, { params: Promise.resolve({ token: "tok", id: "i1" }) });
}

beforeEach(() => {
  state.clientUser = null;
  state.staff = null;
  addByToken.mockClear();
  emailRaiser.mockClear();
  notifyTeam.mockClear();
});

describe("public reply route", () => {
  it("does NOT email anyone when the client replies", async () => {
    state.clientUser = { id: "wu-1", displayName: "Ayesha Khan" };
    const res = await call();
    expect(res.status).toBe(201);
    expect(emailRaiser).not.toHaveBeenCalled();
    expect(addByToken.mock.calls[0][2]).toMatchObject({
      authorKind: "CLIENT",
      authorWikiUserId: "wu-1",
      authorUserId: null,
    });
  });

  it("emails the raiser when a Gitwork user replies from the shared page", async () => {
    state.staff = { user: { id: "u-harry", name: "Harry Brown" } };
    await call();
    expect(emailRaiser).toHaveBeenCalledTimes(1);
    expect(addByToken.mock.calls[0][2]).toMatchObject({
      authorKind: "TEAM",
      authorUserId: "u-harry",
      authorWikiUserId: null,
    });
    expect(notifyTeam.mock.calls[0]).toBeDefined();
  });
});
