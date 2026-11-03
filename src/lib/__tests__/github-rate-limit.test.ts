// @vitest-environment node
/**
 * Every repo scan shares ONE GitHub token. When its hourly limit runs out, GitHub answers
 * 403 to everything. Pulse used to report that as "the repository does not exist, or the
 * token cannot see it" — the wrong cause, on a public repo, at exactly the moment a launch
 * brings the most traffic. Found by running the platform matrix twice in an hour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetGithubRateLimit, githubRateLimitedUntil, githubRequest, safeGithubRequest } from "@/lib/github";

const reply = (status: number, headers: Record<string, string>, body = "") =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers })));

beforeEach(() => { __resetGithubRateLimit(); process.env.GITHUB_TOKEN = "t"; });
afterEach(() => vi.unstubAllGlobals());

describe("rate-limit detection", () => {
  it("a 403 with x-ratelimit-remaining: 0 is a rate limit, and records when it clears", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    reply(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }, '{"message":"API rate limit exceeded"}');
    await expect(githubRequest("/repos/a/b")).rejects.toMatchObject({ code: "GITHUB_RATE_LIMITED" });
    expect(githubRateLimitedUntil()?.getTime()).toBe(reset * 1000);
  });

  it("a secondary limit (429 + retry-after) counts too", async () => {
    reply(429, { "retry-after": "30" });
    await expect(githubRequest("/x")).rejects.toMatchObject({ code: "GITHUB_RATE_LIMITED" });
    expect(githubRateLimitedUntil()).not.toBeNull();
  });

  it("a plain 403 (no access) is NOT called a rate limit", async () => {
    reply(403, { "x-ratelimit-remaining": "4990" }, '{"message":"Resource not accessible by personal access token"}');
    await expect(githubRequest("/repos/a/b")).rejects.toMatchObject({ code: "GITHUB_FORBIDDEN" });
    expect(githubRateLimitedUntil()).toBeNull();
  });

  it("the swallowing helper still records the limit", async () => {
    reply(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60) });
    expect(await safeGithubRequest("/x", "fallback")).toBe("fallback");
    expect(githubRateLimitedUntil()).not.toBeNull();
  });

  it("expires once the reset time has passed", () => {
    expect(githubRateLimitedUntil(Date.now() + 10 * 3600_000)).toBeNull();
  });
});

describe("a repo scan during a rate limit names the real cause", () => {
  it("says the limit is used up — not that the repository does not exist", async () => {
    const reset = Math.floor(Date.now() / 1000) + 900;
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"API rate limit exceeded"}', {
      status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
    })));
    const { runGithubChecks } = await import("@/server/pulse-scan");
    const out = await runGithubChecks("vercel/next.js");
    const access = out.checks.find((c) => c.checkKey === "repo_accessible")!;
    expect(access.status).toBe("FAIL");
    expect(access.detail).toMatch(/limit for Pulse is used up/);
    expect(access.detail).not.toMatch(/does not exist/);
  });
});
