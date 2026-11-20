/**
 * The share page's course request routes used to check only the link token, so anyone with a
 * Wedge share link could edit or delete requests without logging in (§140).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const state = {
  found: null as null | { wiki: { id: string; clientId: string; client: { slug: string; workspaceId: string } }; onlySection: string | null },
  cookieUser: false,
  session: null as null | { user: { id: string } },
  team: false,
};
vi.mock("@/server/wiki-board-access", () => ({
  wikiForToken: vi.fn(async () => state.found),
  teamWriterFor: vi.fn(async () => (state.team ? { id: "u1", name: "Team" } : null)),
}));
vi.mock("@/server/wiki-access", () => ({
  wikiAccessCookieName: (id: string) => `wiki_access_${id}`,
  resolveWikiAccessUser: vi.fn(async () => (state.cookieUser ? { id: "wu1", displayName: "Luke" } : null)),
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => state.session) }));
vi.mock("@/server/rate-limit", () => ({ assertWithinRateLimit: vi.fn(), clientIpFrom: () => "1.1.1.1" }));

import { resolveCourseRequestAccess } from "@/server/wiki-course-request-access";

const req = { cookies: { get: () => ({ value: "c" }) }, headers: new Headers() } as never;
const wedge = (onlySection: string | null = null) => ({
  wiki: { id: "w1", clientId: "c1", client: { slug: "wedge", workspaceId: "ws1" } },
  onlySection,
});

beforeEach(() => {
  state.found = wedge();
  state.cookieUser = false;
  state.session = null;
  state.team = false;
});

describe("course requests on the share page need a sign-in", () => {
  it("refuses someone holding only the link", async () => {
    expect(await resolveCourseRequestAccess(req, "t")).toMatchObject({ ok: false, status: 401 });
  });

  it("lets a signed-in client user of this wiki in", async () => {
    state.cookieUser = true;
    expect(await resolveCourseRequestAccess(req, "t")).toEqual({ ok: true, clientId: "c1", wikiId: "w1" });
  });

  it("lets this client's team in, but not any Foundry session", async () => {
    state.session = { user: { id: "u1" } };
    expect(await resolveCourseRequestAccess(req, "t")).toMatchObject({ ok: false, status: 401 });
    state.team = true;
    expect(await resolveCourseRequestAccess(req, "t")).toMatchObject({ ok: true });
  });

  it("refuses a link for another section, and a client without course requests", async () => {
    state.cookieUser = true;
    state.found = wedge("board");
    expect(await resolveCourseRequestAccess(req, "t")).toMatchObject({ ok: false, status: 403 });
    state.found = { ...wedge(), wiki: { ...wedge().wiki, client: { slug: "fellas", workspaceId: "ws1" } } };
    expect(await resolveCourseRequestAccess(req, "t")).toMatchObject({ ok: false, status: 404 });
  });

  it("every handler under the share page's course request routes checks access", () => {
    const dir = join(process.cwd(), "src/app/api/wiki/[token]/course-requests");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("route.ts"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toContain("resolvePublicWiki");
      const handlers = (src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? []).length;
      const direct = (src.match(/resolveCourseRequestAccess\(req, token\)/g) ?? []).length;
      const viaHelper = (src.match(/await ownRow\(req, token, id\)/g) ?? []).length;
      expect(direct + viaHelper, `${f}: every handler must check access`).toBeGreaterThanOrEqual(handlers);
    }
  });
});
