/**
 * The wiki-scoped avatar route: a client can load their team's photos, and nothing else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  wiki: null as null | { id: string; clientId: string },
  wikiWhere: null as unknown,
  session: null as null | { user: { id: string } },
  unlocked: false,
  productTeam: [] as string[],
  placed: 0,
}));

vi.mock("@/auth", () => ({ auth: async () => h.session }));
vi.mock("@/server/wiki-access", () => ({
  wikiAccessCookieName: (id: string) => `wiki_${id}`,
  verifyWikiAccessCookie: async () => h.unlocked,
}));
vi.mock("@/server/avatar-response", () => ({
  avatarResponse: async (id: string) => new Response(`img:${id}`, { status: 200 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWiki: {
      findFirst: async (args: { where: unknown }) => {
        h.wikiWhere = args.where;
        return h.wiki;
      },
    },
    workspaceClient: { findUnique: async () => ({ productTeamUserIds: h.productTeam }) },
    placement: { count: async () => h.placed },
  },
}));

import { GET } from "../route";

const call = (userId = "user1", token = "share1") =>
  GET({ cookies: { get: () => ({ value: "c" }) } } as never, { params: Promise.resolve({ token, userId }) });

beforeEach(() => {
  h.wiki = { id: "w1", clientId: "c1" };
  h.session = null;
  h.unlocked = true;
  h.productTeam = ["user1"];
  h.placed = 0;
});

describe("GET /api/wiki/[token]/avatars/[userId]", () => {
  it("⚠️ serves a product-team photo to a client who can open the wiki", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("img:user1");
  });

  it("serves a placed developer's photo", async () => {
    h.productTeam = [];
    h.placed = 1;
    expect((await call()).status).toBe(200);
  });

  it("⚠️ is 404 for someone not on this wiki's team", async () => {
    h.productTeam = ["someone-else"];
    expect((await call()).status).toBe(404);
  });

  it("is 401 for a viewer who can't open the wiki", async () => {
    h.unlocked = false;
    expect((await call()).status).toBe(401);
  });

  it("a signed-in Foundry user doesn't need the access cookie", async () => {
    h.unlocked = false;
    h.session = { user: { id: "staff" } };
    expect((await call()).status).toBe(200);
  });

  it("is 404 for an unknown token, and only share tokens are looked up", async () => {
    h.wiki = null;
    expect((await call()).status).toBe(404);
    expect(JSON.stringify(h.wikiWhere)).not.toContain("courseIngestToken");
    expect(JSON.stringify(h.wikiWhere)).toContain("shareEnabled");
  });

  it("rejects a malformed user id without a lookup", async () => {
    expect((await call("../../etc")).status).toBe(404);
  });
});
