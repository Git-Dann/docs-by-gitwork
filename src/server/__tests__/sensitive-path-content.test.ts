// @vitest-environment node
/**
 * A 200 is not exposure. Found on the October 2026 corpus run:
 *   - vercel.com answers /.git/config, /phpinfo.php, /backup.sql, /.env.bak with its own
 *     2.6 MB HTML homepage (while a random path 404s, so the catch-all guard misses it)
 *     → three FAILs telling Vercel it was leaking source and a database.
 *   - www.cbc.ca answers /phpinfo.php with its "Menu" page → FAIL.
 *   - github.com/telescope is a USER called telescope; cal.com/telescope is a booking
 *     page → "Laravel Telescope is public".
 * Each probe now reads the body and only calls a path exposed when it IS the thing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Route = (url: string) => Response | Error;
let route: Route = () => new Error("unset");

vi.mock("@/server/pulse-lite/url-guard", async (orig) => {
  const actual = await orig<typeof import("@/server/pulse-lite/url-guard")>();
  return {
    ...actual,
    fetchScannableUrl: vi.fn(async (url: string) => {
      const r = route(url);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

import {
  runUrlChecks, looksLikeAdminLogin, looksLikeDebugTool, looksLikeEnvFile, looksLikeGitConfig,
  looksLikeGraphqlEndpoint, looksLikeOpenApi, looksLikePhpInfo, looksLikeSqlDump, fetchSnippet,
} from "@/server/pulse-scan";

const res = (status: number, body: string, contentType = "text/html; charset=utf-8") => {
  const r = new Response(body, { status, headers: { "content-type": contentType } });
  Object.defineProperty(r, "url", { value: "https://site.test/" });
  return r;
};
const HOMEPAGE = `<!DOCTYPE html><html data-dpl-id="dpl_x"><head><title>Vercel: Build and deploy the best web experiences</title></head><body><nav>Menu</nav><a href="/privacy">Privacy</a></body></html>`;

const KEYS = ["no_exposed_admin", "no_exposed_phpinfo", "no_exposed_git_config", "no_debug_endpoints", "no_exposed_backup"];

async function exposure() {
  const out = await runUrlChecks("https://site.test", "WEB_APP");
  return Object.fromEntries(out.checks.filter((c) => KEYS.includes(c.checkKey)).map((c) => [c.checkKey, c]));
}

beforeEach(() => { route = () => new Error("unset"); });

describe("a host that soft-routes sensitive paths to its homepage is not reported as exposed", () => {
  it("vercel.com shape: homepage for every sensitive path, 404 for a random one", async () => {
    route = (url) => {
      const path = new URL(url).pathname;
      if (path === "/" || /\.(git|php|sql|bak)|admin|telescope|horizon|clockwork|_debug/.test(path)) return res(200, HOMEPAGE);
      return res(404, "# Page not found", "text/markdown");
    };
    const c = await exposure();
    for (const k of KEYS) expect(c[k]?.status, k).toBe("PASS");
    expect(c.no_exposed_git_config.detail).toMatch(/ordinary page/);
  });
});

describe("a genuinely exposed file is still caught", () => {
  const exposed: Array<[string, string, string, string]> = [
    ["no_exposed_git_config", "/.git/config", "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n[remote \"origin\"]\n\turl = git@github.com:acme/app.git\n", "text/plain"],
    ["no_exposed_phpinfo", "/phpinfo.php", "<html><head><title>phpinfo()</title></head><body><h1>PHP Version 8.2.12</h1><td>Loaded Configuration File</td></body></html>", "text/html"],
    ["no_exposed_backup", "/dump.sql", "-- MySQL dump 10.13  Distrib 8.0.36\nCREATE TABLE `users` (\n  `id` int NOT NULL\n);\n", "application/sql"],
    ["no_exposed_backup", "/.env.bak", "APP_KEY=base64:abc\nDB_PASSWORD=hunter2\n# comment\nSTRIPE_SECRET=sk_live_x\n", "application/octet-stream"],
    ["no_debug_endpoints", "/telescope", '<html><head><title>Telescope - Acme</title><script src="/vendor/telescope/app.js"></script></head></html>', "text/html"],
    ["no_exposed_admin", "/wp-admin", '<html><head><title>Dashboard &lsaquo; Acme &#8212; WordPress</title></head><body><div id="wpadminbar"></div><h1>Dashboard</h1></body></html>', "text/html"],
  ];
  for (const [key, path, body, type] of exposed) {
    it(`${key} at ${path}`, async () => {
      route = (url) => {
        const p = new URL(url).pathname;
        if (p === path) return res(200, body, type);
        if (p === "/") return res(200, HOMEPAGE);
        return res(404, "not found", "text/plain");
      };
      const c = await exposure();
      expect(["FAIL", "WARN"]).toContain(c[key].status);
      expect(c[key].detail).toContain(path === "/wp-admin" ? "/wp-admin" : path.replace(/^\//, "") ? path.split("/").pop()! : path);
    });
  }
});

describe("an admin area behind a sign-in is not exposed", () => {
  // Every WordPress site serves a sign-in form at /wp-admin. That is the admin area
  // protecting itself, not an exposure; the dashboard served without one is (above).
  it("WordPress sign-in form at /wp-admin passes", async () => {
    route = (url) => {
      const p = new URL(url).pathname;
      if (p === "/wp-admin") return res(200, '<html><head><title>Log In &lsaquo; Acme &#8212; WordPress</title></head><body><form id="loginform"><input name="log"><input type="password" name="pwd"></form></body></html>');
      if (p === "/") return res(200, HOMEPAGE);
      return res(404, "not found", "text/plain");
    };
    const c = await exposure();
    expect(c.no_exposed_admin.status).toBe("PASS");
  });
});

describe("a probe that failed is inconclusive, never a pass", () => {
  it("connection errors on the sensitive paths", async () => {
    route = (url) => (new URL(url).pathname === "/" ? res(200, HOMEPAGE) : new Error("ECONNRESET"));
    const c = await exposure();
    for (const k of KEYS) expect(c[k].status, k).toBe("INCONCLUSIVE");
  });
});

describe("signatures name the thing, not a word a page might contain", () => {
  it("rejects real pages that only mention the word", () => {
    expect(looksLikeDebugTool("/telescope", { status: 200, contentType: "text/html", body: "<title>telescope (Telescope) · GitHub</title>" })).toBe(false);
    expect(looksLikeDebugTool("/horizon", { status: 200, contentType: "text/html", body: "<title>K | Cal.com</title> book a horizon call" })).toBe(false);
    expect(looksLikeDebugTool("/_debug", { status: 200, contentType: "text/html", body: "<title>Prasanna &amp; Shashank | Cal.com</title>" })).toBe(false);
    expect(looksLikePhpInfo("<title>Menu</title> learn PHP version history")).toBe(false);
    expect(looksLikeGitConfig("<html>[core] values we live by</html>")).toBe(false);
    expect(looksLikeSqlDump("Our blog post: how to CREATE TABLE in Postgres")).toBe(false);
    expect(looksLikeEnvFile(HOMEPAGE)).toBe(false);
    expect(looksLikeAdminLogin("<title>Admin tips for your blog</title>")).toBe(false);
  });
  it("accepts the real formats", () => {
    expect(looksLikeSqlDump("--\n-- PostgreSQL database dump\n--\nSET statement_timeout = 0;")).toBe(true);
    expect(looksLikeOpenApi('{"openapi":"3.1.0","info":{"title":"x"}}')).toBe(true);
    expect(looksLikeOpenApi("openapi: 3.0.3\ninfo:\n  title: x")).toBe(true);
    expect(looksLikeOpenApi(HOMEPAGE)).toBe(false);
    expect(looksLikeGraphqlEndpoint({ status: 400, contentType: "application/json", body: '{"errors":[{"message":"Must provide query string."}]}' })).toBe(true);
    expect(looksLikeGraphqlEndpoint({ status: 200, contentType: "text/html", body: HOMEPAGE })).toBe(false);
  });
});

describe("fetchSnippet reads only the start of a large body", () => {
  it("caps the read", async () => {
    route = () => res(200, "x".repeat(3_000_000));
    const p = await fetchSnippet("https://site.test/big");
    expect(p.status).toBe(200);
    expect(p.body.length).toBeLessThanOrEqual(16_384 + 65_536);
  });
});
