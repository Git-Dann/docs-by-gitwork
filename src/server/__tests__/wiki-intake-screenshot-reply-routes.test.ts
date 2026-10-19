/**
 * A reply may be a screenshot with no text — on both the internal and the public reply
 * routes — but a reply with neither text nor a screenshot is still a 400.
 *
 * The screenshot travels in the SAME multipart request as the reply, so the server sees
 * it when deciding whether the reply is empty: there is no window where an empty reply
 * exists waiting for an upload that may never come.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildTeamReplyEmail } from "@/lib/wiki-intake-reply-notify";

const addByToken = vi.hoisted(() =>
  vi.fn(async (_t: string, _i: string, input: { body: string }) => ({ id: "c-new", body: input.body })),
);
const addInternal = vi.hoisted(() =>
  vi.fn(async (_s: string, _i: string, _a: unknown, body: string) => ({ id: "c-new", body, wikiId: "w1" })),
);
const emailRaiser = vi.hoisted(() => vi.fn(async () => ({ sent: true })));
const resolveMentions = vi.hoisted(() => vi.fn(async (_w: string, _k: string, ids: string[]) => ids.map((id) => ({ id }))));

vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void fn() };
});
vi.mock("@/server/wiki", () => ({
  resolveWikiIdByPublicToken: vi.fn(async () => "w1"),
  addWikiIntakeCommentByToken: addByToken,
  addWikiIntakeComment: addInternal,
  wikiIdForClientSlug: vi.fn(async () => "w1"),
}));
vi.mock("@/server/wiki-access", () => ({
  resolveWikiAccessUser: vi.fn(async () => ({ id: "wu-1", displayName: "Ayesha Khan" })),
  wikiAccessCookieName: () => "wiki_access_w1",
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/auth/effective-user", () => ({
  requireAuthedUser: vi.fn(async () => ({ id: "u-harry", name: "Harry Brown", email: "h@g", role: "ADMIN" })),
}));
vi.mock("@/server/wiki-intake-mentions", () => ({
  resolveMentions,
  notifyIntakeMentions: vi.fn(async () => ({ posted: false })),
}));
vi.mock("@/server/wiki-intake-reply-notify", () => ({
  emailRaiserOnTeamReply: emailRaiser,
  notifyTeamMentionsOnRequest: vi.fn(async () => ({ notified: 0 })),
}));

import { POST as publicPost } from "@/app/api/wiki/[token]/intake-items/[id]/comments/route";
import { POST as internalPost } from "@/app/api/clients/[slug]/wiki/intake-items/[id]/comments/route";

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "shot.png", { type: "image/png" });

function multipart(body: string, file: File | null, mentionIds?: string[]) {
  const form = new FormData();
  form.append("body", body);
  if (mentionIds) form.append("mentionIds", JSON.stringify(mentionIds));
  if (file) form.append("file", file);
  return form;
}

function json(body: string) {
  return { body: JSON.stringify({ body }), headers: { "content-type": "application/json" } };
}

type Init = { body: BodyInit; headers?: Record<string, string> };

const routes = [
  [
    "public",
    (init: Init) =>
      publicPost(new NextRequest("http://x/api/wiki/tok/intake-items/i1/comments", { method: "POST", ...init }), {
        params: Promise.resolve({ token: "tok", id: "i1" }),
      }),
    () => addByToken.mock.calls[0]?.[2] as { body: string; image: unknown } | undefined,
  ],
  [
    "internal",
    (init: Init) =>
      internalPost(
        new NextRequest("http://x/api/clients/acme/wiki/intake-items/i1/comments", { method: "POST", ...init }),
        { params: Promise.resolve({ slug: "acme", id: "i1" }) },
      ),
    () => {
      const c = addInternal.mock.calls[0] as unknown[] | undefined;
      return c ? { body: c[3] as string, image: c[5] } : undefined;
    },
  ],
] as const;

beforeEach(() => {
  addByToken.mockClear();
  addInternal.mockClear();
  emailRaiser.mockClear();
  resolveMentions.mockClear();
});

describe.each(routes)("%s reply route", (_name, post, saved) => {
  it("accepts a screenshot with no text", async () => {
    const res = await post({ body: multipart("   ", png()) });
    expect(res.status).toBe(201);
    const call = saved();
    expect(call?.body).toBe("");
    expect(call?.image).toMatchObject({ mime: "image/png", filename: "shot.png" });
  });

  it("rejects a reply with neither text nor a screenshot (JSON)", async () => {
    const res = await post(json("   "));
    expect(res.status).toBe(400);
    expect(saved()).toBeUndefined();
  });

  it("rejects a reply with neither text nor a screenshot (multipart)", async () => {
    const res = await post({ body: multipart("", null) });
    expect(res.status).toBe(400);
    expect(saved()).toBeUndefined();
  });

  it("still accepts plain text as JSON, with no image", async () => {
    const res = await post(json("Thanks!"));
    expect(res.status).toBe(201);
    expect(saved()?.body).toBe("Thanks!");
    expect(saved()?.image ?? null).toBeNull();
  });

  it("refuses a non-image file", async () => {
    const res = await post({ body: multipart("", new File(["x"], "a.txt", { type: "text/plain" })) });
    expect(res.status).toBe(415);
    expect(saved()).toBeUndefined();
  });

  it("mentions nobody on a screenshot-only reply, whatever ids were sent", async () => {
    await post({ body: multipart("", png(), ["team:u-1"]) });
    expect(resolveMentions).toHaveBeenCalledWith("w1", expect.any(String), []);
  });
});

describe("the reply email for a screenshot-only reply", () => {
  it("says a screenshot was sent instead of quoting nothing", () => {
    const email = buildTeamReplyEmail({
      clientName: "Acme",
      itemTitle: "Search is broken",
      authorName: "Harry Brown",
      body: "",
      link: null,
    });
    expect(email.subject).toBe('Harry Brown sent a screenshot on "Search is broken"');
    expect(email.text).toContain("Sent a screenshot");
    expect(email.html).toContain("Sent a screenshot");
  });

  it("quotes the text as before when there is some", () => {
    const email = buildTeamReplyEmail({
      clientName: "Acme",
      itemTitle: "Search is broken",
      authorName: "Harry Brown",
      body: "Fixed now",
      link: null,
    });
    expect(email.subject).toBe('Harry Brown replied to "Search is broken"');
    expect(email.text).toContain("Fixed now");
  });
});
