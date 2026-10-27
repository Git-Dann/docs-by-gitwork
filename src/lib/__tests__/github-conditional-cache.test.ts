// @vitest-environment node
/**
 * Every Pulse repo scan shares ONE GitHub token, 5,000 REST calls an hour. GitHub does not
 * count a conditional GET that comes back 304 against that limit, so githubRequest sends the
 * stored ETag / Last-Modified back and serves the stored body on a 304. These tests pin the
 * rules that make that safe: only a real 304 serves a stored body, errors are never stored,
 * tokens never share entries, and the cache is bounded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetGithubCache,
  __resetGithubRateLimit,
  githubCacheStats,
  githubGraphQL,
  githubRateLimitedUntil,
  githubRequest,
} from "@/lib/github";
import { GithubConditionalCache, tokenIdentity } from "@/lib/github-cache";

type Call = { url: string; headers: Record<string, string>; method?: string };

function stubFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: { ...(init?.headers as Record<string, string>) }, method: init?.method });
      const make = responses[Math.min(i, responses.length - 1)];
      i++;
      return make();
    }),
  );
  return calls;
}

const ok = (body: unknown, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status: 200, headers });
const notModified = () => new Response(null, { status: 304 });

beforeEach(() => {
  __resetGithubCache();
  __resetGithubRateLimit();
  process.env.GITHUB_TOKEN = "token-a";
});
afterEach(() => vi.unstubAllGlobals());

describe("conditional GETs", () => {
  it("a 200 with an ETag is stored, and the next identical GET sends If-None-Match", async () => {
    const calls = stubFetch([ok({ n: 1 }, { etag: '"abc"' }), notModified]);
    await githubRequest("/repos/a/b");
    expect(calls[0].headers["If-None-Match"]).toBeUndefined();
    await githubRequest("/repos/a/b");
    expect(calls[1].headers["If-None-Match"]).toBe('"abc"');
  });

  it("a 304 returns the stored body as if it were a 200", async () => {
    stubFetch([ok({ name: "next.js", stars: 9 }, { etag: '"v1"' }), notModified]);
    const first = await githubRequest<{ name: string }>("/repos/a/b");
    const second = await githubRequest<{ name: string }>("/repos/a/b");
    expect(second).toEqual(first);
    expect(githubCacheStats().notModified).toBe(1);
  });

  it("Last-Modified is used when there is no ETag", async () => {
    const calls = stubFetch([ok({ n: 1 }, { "last-modified": "Wed, 21 Oct 2026 07:28:00 GMT" }), notModified]);
    await githubRequest("/x");
    await githubRequest("/x");
    expect(calls[1].headers["If-Modified-Since"]).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
  });

  it("a response with no validator is not stored", async () => {
    const calls = stubFetch([ok({ n: 1 }), ok({ n: 2 })]);
    await githubRequest("/x");
    await githubRequest("/x");
    expect(calls[1].headers["If-None-Match"]).toBeUndefined();
    expect(githubCacheStats().entries).toBe(0);
  });

  it("a fresh 200 replaces the stored body", async () => {
    stubFetch([ok({ n: 1 }, { etag: '"1"' }), ok({ n: 2 }, { etag: '"2"' }), notModified]);
    await githubRequest("/x");
    expect(await githubRequest("/x")).toEqual({ n: 2 });
    expect(await githubRequest("/x")).toEqual({ n: 2 });
  });

  it("a caller mutating the result cannot corrupt the stored body", async () => {
    stubFetch([ok({ list: [1] }, { etag: '"1"' }), notModified]);
    const first = await githubRequest<{ list: number[] }>("/x");
    first.list.push(99);
    expect(await githubRequest("/x")).toEqual({ list: [1] });
  });
});

describe("token identity", () => {
  it("a different token never shares an entry", async () => {
    const calls = stubFetch([ok({ secret: "private" }, { etag: '"p"' }), ok({ n: 2 })]);
    await githubRequest("/repos/acme/private");
    process.env.GITHUB_TOKEN = "token-b";
    await githubRequest("/repos/acme/private");
    expect(calls[1].headers["If-None-Match"]).toBeUndefined();
  });

  it("an unauthenticated caller never shares an authenticated entry", async () => {
    const calls = stubFetch([ok({ n: 1 }, { etag: '"p"' }), ok({ n: 2 })]);
    await githubRequest("/x");
    delete process.env.GITHUB_TOKEN;
    await githubRequest("/x");
    expect(calls[1].headers["If-None-Match"]).toBeUndefined();
  });

  it("the identity is a short hash, never the token itself", () => {
    expect(tokenIdentity("ghp_secret")).not.toContain("secret");
    expect(tokenIdentity("ghp_secret")).toHaveLength(16);
    expect(tokenIdentity(undefined)).toBe("anon");
  });
});

describe("errors are never cached and never masked", () => {
  it("a 404 is not stored, and the next call sends no validator", async () => {
    const calls = stubFetch([() => new Response("{}", { status: 404, headers: { etag: '"e"' } }), ok({ n: 1 })]);
    await expect(githubRequest("/x")).rejects.toMatchObject({ code: "GITHUB_NOT_FOUND" });
    await githubRequest("/x");
    expect(calls[1].headers["If-None-Match"]).toBeUndefined();
  });

  it("an error after a stored 200 is reported, and drops the entry", async () => {
    const calls = stubFetch([
      ok({ n: 1 }, { etag: '"1"' }),
      () => new Response("{}", { status: 404 }),
      ok({ n: 3 }),
    ]);
    await githubRequest("/x");
    await expect(githubRequest("/x")).rejects.toMatchObject({ code: "GITHUB_NOT_FOUND" });
    await githubRequest("/x");
    expect(calls[2].headers["If-None-Match"]).toBeUndefined();
  });

  it("a rate limit is still recorded and reported even when a body is stored", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    stubFetch([
      ok({ n: 1 }, { etag: '"1"' }),
      () => new Response('{"message":"API rate limit exceeded"}', {
        status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
      }),
    ]);
    await githubRequest("/x");
    await expect(githubRequest("/x")).rejects.toMatchObject({ code: "GITHUB_RATE_LIMITED" });
    expect(githubRateLimitedUntil()?.getTime()).toBe(reset * 1000);
  });

  it("a 304 with nothing stored is an error, not an invented body", async () => {
    stubFetch([notModified]);
    await expect(githubRequest("/x")).rejects.toMatchObject({ code: "GITHUB_REQUEST_FAILED" });
  });
});

describe("bounds", () => {
  it("evicts the least recently used entry by count", () => {
    const c = new GithubConditionalCache({ maxEntries: 2, maxBytes: 1e9, maxEntryBytes: 1e9 });
    c.set("a", "1", '"a"', null);
    c.set("b", "1", '"b"', null);
    c.get("a"); // a is now most recent
    c.set("c", "1", '"c"', null);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBeDefined();
    expect(c.get("c")).toBeDefined();
  });

  it("evicts by total bytes", () => {
    const c = new GithubConditionalCache({ maxEntries: 100, maxBytes: 10, maxEntryBytes: 10 });
    c.set("a", "xxxxxx", '"a"', null);
    c.set("b", "yyyyyy", '"b"', null);
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBeDefined();
    expect(c.stats().bytes).toBe(6);
  });

  it("does not store a body over the per-entry cap", () => {
    const c = new GithubConditionalCache({ maxEntries: 100, maxBytes: 1e9, maxEntryBytes: 4 });
    expect(c.set("a", "12345", '"a"', null)).toBe(false);
    expect(c.get("a")).toBeUndefined();
    expect(c.stats().oversize).toBe(1);
  });
});

describe("out of scope", () => {
  it("GraphQL POSTs carry no conditional headers", async () => {
    const calls = stubFetch([
      ok({ data: { repository: { name: "x" } } }, { etag: '"g"' }),
      ok({ data: { repository: { name: "x" } } }, { etag: '"g"' }),
    ]);
    await githubGraphQL("{ repository { name } }");
    await githubGraphQL("{ repository { name } }");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].headers["If-None-Match"]).toBeUndefined();
    expect(githubCacheStats().entries).toBe(0);
  });
});
