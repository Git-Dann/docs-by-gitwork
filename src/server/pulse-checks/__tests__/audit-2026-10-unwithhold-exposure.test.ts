// @vitest-environment node
/**
 * no_exposed_env / no_exposed_git were withheld because an unreachable site reported
 * ".env not public" as a FAIL — which reads as "your .env is exposed" — and likewise
 * for .git. That came from the "Could not reach the site" branch of runUrlChecks, which
 * is now unreachable: a site Pulse cannot read stops with one target_content_accessible
 * finding (§61). These pin that, and pin that a reachable site is judged on what the
 * path serves (the file's own format), so a catch-all host is not called exposed.
 *
 * The network is faked at the one SSRF-guarded transport; everything else is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exposureVerdict, looksLikeEnvFile, looksLikeGitHead } from "../path-probe";

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

const { runUrlChecks } = await import("@/server/pulse-scan");

const res = (status: number, body: string, contentType = "text/html; charset=utf-8", url = "https://site.test/") => {
  const r = new Response(body, { status, headers: { "content-type": contentType } });
  Object.defineProperty(r, "url", { value: url });
  return r;
};
const HOME = "<!doctype html><html lang=en><head><title>Site</title></head><body><h1>Site</h1><p>Hello.</p></body></html>";

/** Homepage served normally; `paths` decides /.env and /.git/HEAD; everything else 404s. */
function site(paths: Record<string, () => Response | Error>): Route {
  return (url) => {
    const { pathname } = new URL(url);
    if (pathname === "/" || pathname === "") return res(200, HOME);
    const hit = paths[pathname];
    return hit ? hit() : res(404, "not found", "text/plain", url);
  };
}
async function exposure() {
  const out = await runUrlChecks("https://site.test", "WEB_APP");
  return {
    env: out.checks.find((c) => c.checkKey === "no_exposed_env"),
    git: out.checks.find((c) => c.checkKey === "no_exposed_git"),
  };
}

beforeEach(() => { route = () => new Error("unset"); });

describe("an unreachable site is never reported as exposing .env or .git", () => {
  it.each([
    ["connection refused", () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })],
    ["timeout", () => Object.assign(new Error("aborted"), { name: "AbortError" })],
    ["HTTP 503", () => res(503, "")],
  ])("%s → neither check is emitted", async (_name, r) => {
    route = r as Route;
    const { env, git } = await exposure();
    expect(env).toBeUndefined();
    expect(git).toBeUndefined();
  });
});

describe("a reachable site is judged on what the path serves", { timeout: 60_000 }, () => {
  it("a real .env and a real .git/HEAD are FAILs", async () => {
    route = site({
      "/.env": () => res(200, "DATABASE_URL=postgres://u:p@db/app\nSTRIPE_KEY=abc\n", "text/plain"),
      "/.git/HEAD": () => res(200, "ref: refs/heads/main\n", "text/plain"),
    });
    const { env, git } = await exposure();
    expect(env?.status).toBe("FAIL");
    expect(git?.status).toBe("FAIL");
  });

  it("a catch-all host serving its app shell for every path is not exposed", async () => {
    route = site({ "/.env": () => res(200, HOME), "/.git/HEAD": () => res(200, HOME) });
    const { env, git } = await exposure();
    expect(env?.status).toBe("PASS");
    expect(git?.status).toBe("PASS");
  });

  it("a catch-all answering plain text for every path is not exposed", async () => {
    route = site({ "/.env": () => res(200, "Not Found", "text/plain"), "/.git/HEAD": () => res(200, "Not Found", "text/plain") });
    const { env, git } = await exposure();
    expect(env?.status).toBe("PASS");
    expect(git?.status).toBe("PASS");
  });

  it("a 403 is not exposed", async () => {
    route = site({ "/.env": () => res(403, "Forbidden", "text/plain"), "/.git/HEAD": () => res(403, "Forbidden", "text/plain") });
    const { env, git } = await exposure();
    expect(env?.status).toBe("PASS");
    expect(git?.status).toBe("PASS");
  });
});

describe("path-probe exposure helpers (for a probe that must not guess)", () => {
  const probe = (status: number, body: string, contentType = "text/plain") => ({ status, contentType, body });
  it.each([
    [probe(200, "ref: refs/heads/main\n"), "exposed"],
    [probe(200, "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3"), "exposed"],
    [probe(200, HOME, "text/html"), "not_exposed"],
    [probe(200, "Not Found"), "not_exposed"],
    [probe(200, "Your checkout HEAD file reads ref: refs/heads/main"), "not_exposed"],
    [probe(404, ""), "not_exposed"],
    [probe(403, "Forbidden"), "not_exposed"],
    [probe(0, ""), "unestablished"],
    [probe(429, ""), "unestablished"],
    [probe(502, ""), "unestablished"],
  ] as const)("git HEAD %# → %s", (p, verdict) => {
    expect(exposureVerdict(p, looksLikeGitHead)).toBe(verdict);
  });
  it("env: a page that merely mentions KEY=value is not an env file", () => {
    expect(exposureVerdict(probe(200, "<html><body>Set API_KEY=xyz in your env</body></html>", "text/html"), looksLikeEnvFile)).toBe("not_exposed");
    expect(exposureVerdict(probe(200, "API_KEY=xyz\nDB_URL=postgres://x\n"), looksLikeEnvFile)).toBe("exposed");
  });
});
