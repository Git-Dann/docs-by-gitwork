import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  shouldRenewWikiAccess,
  WIKI_ACCESS_COOKIE_MAX_AGE,
  wikiAccessCookieOptions,
  wikiAccessCookiesToRenew,
} from "../wiki-access-cookie";

describe("how long a client stays signed in", () => {
  it("is 30 days, not the old 7", () => {
    expect(WIKI_ACCESS_COOKIE_MAX_AGE).toBe(30 * 24 * 60 * 60);
    expect(wikiAccessCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: WIKI_ACCESS_COOKIE_MAX_AGE });
  });

  it("renews on a visit to a wiki page, and on nothing else", () => {
    expect(shouldRenewWikiAccess("/wiki/wedge/abc123", "GET")).toBe(true);
    expect(shouldRenewWikiAccess("/wiki/wedge/abc123", "POST")).toBe(false);
    expect(shouldRenewWikiAccess("/api/wiki/abc123", "GET")).toBe(false);
    expect(shouldRenewWikiAccess("/app/portal", "GET")).toBe(false);
    expect(shouldRenewWikiAccess("/wikipedia", "GET")).toBe(false);
  });

  it("renews only the client sign-in cookies, as they are", () => {
    const out = wikiAccessCookiesToRenew([
      { name: "wiki_access_w1", value: "u1.sig" },
      { name: "wiki_access_w2", value: "" },
      { name: "authjs.session-token", value: "secret" },
      { name: "theme", value: "dark" },
    ]);
    expect(out).toEqual([{ name: "wiki_access_w1", value: "u1.sig" }]);
  });

  it("the middleware renews them, and the sign-in sets them, with the same options", () => {
    const mw = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(mw).toMatch(/shouldRenewWikiAccess\(pathname, req\.method\)/);
    expect(mw).toMatch(/\.\.\.wikiAccessCookieOptions\(\)/);
    const login = readFileSync(join(process.cwd(), "src/app/api/portal/login/route.ts"), "utf8");
    expect(login).toMatch(/\.\.\.wikiAccessCookieOptions\(\)/);
  });
});
