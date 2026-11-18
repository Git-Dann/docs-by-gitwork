/**
 * The Portal's Slack digest (src/server/slack-activity-digest.ts). The failure this guards: one
 * failed AI call cached `{ summary: null }` and the card showed a dead sentence over a channel
 * full of messages until someone posted again (Wedge, Nov 2026).
 */
import { describe, expect, it, vi } from "vitest";
import { describeDigestError, resolveSlackDigest, type DigestCacheHit, type SummariseResult } from "../slack-activity-digest";

function run(opts: {
  canCompute?: boolean;
  force?: boolean;
  cache?: DigestCacheHit;
  result?: SummariseResult | Error;
}) {
  const writeCache = vi.fn(async () => {});
  const summarise = vi.fn(async (): Promise<SummariseResult> => {
    if (opts.result instanceof Error) throw opts.result;
    return opts.result ?? { kind: "ok", text: "• Shipped search" };
  });
  const readCache = vi.fn(async () => opts.cache ?? null);
  const promise = resolveSlackDigest({
    canCompute: opts.canCompute ?? true,
    force: opts.force ?? false,
    readCache,
    writeCache,
    summarise,
  });
  return { promise, writeCache, summarise, readCache };
}

describe("the Slack digest", () => {
  it("reuses a cached digest without asking the AI", async () => {
    const { promise, summarise } = run({ cache: { response: { summary: "• Cached" }, cachedAt: "2026-11-18T10:00:00.000Z" } });
    expect(await promise).toMatchObject({ summary: "• Cached", reason: "ok", cached: true });
    expect(summarise).not.toHaveBeenCalled();
  });

  it("writes and caches a fresh digest", async () => {
    const { promise, writeCache } = run({});
    expect(await promise).toMatchObject({ summary: "• Shipped search", reason: "ok", cached: false });
    expect(writeCache).toHaveBeenCalledWith("• Shipped search");
  });

  it("never caches a failed call, and says why in plain words", async () => {
    const { promise, writeCache } = run({ result: { kind: "failed", error: "400 credit balance is too low" } });
    const out = await promise;
    expect(out.reason).toBe("ai_failed");
    expect(out.summary).toBeNull();
    expect(out.aiError).toContain("out of credit");
    expect(out.aiError).not.toContain("credit balance");
    expect(writeCache).not.toHaveBeenCalled();
  });

  it("treats a thrown error the same as a failed call", async () => {
    const { promise, writeCache } = run({ result: new Error("fetch failed") });
    expect((await promise).reason).toBe("ai_failed");
    expect(writeCache).not.toHaveBeenCalled();
  });

  it("never caches an empty answer", async () => {
    const { promise, writeCache } = run({ result: { kind: "ok", text: "   " } });
    expect((await promise).reason).toBe("ai_failed");
    expect(writeCache).not.toHaveBeenCalled();
  });

  it("ignores an empty digest cached before the fix and tries again", async () => {
    const { promise, summarise } = run({ cache: { response: { summary: null }, cachedAt: "2026-11-01T00:00:00.000Z" } });
    expect(await promise).toMatchObject({ summary: "• Shipped search", reason: "ok" });
    expect(summarise).toHaveBeenCalledTimes(1);
  });

  it("says when there is no AI key, without caching", async () => {
    const { promise, writeCache } = run({ result: { kind: "no_ai_key" } });
    expect(await promise).toMatchObject({ reason: "no_ai_key", summary: null, aiError: null });
    expect(writeCache).not.toHaveBeenCalled();
  });

  it("a viewer who can't spend tokens gets the cached digest, or 'stale' — never a call", async () => {
    const hit = run({ canCompute: false, cache: { response: { summary: "• Cached" }, cachedAt: "2026-11-18T10:00:00.000Z" } });
    expect((await hit.promise).summary).toBe("• Cached");
    const miss = run({ canCompute: false });
    expect(await miss.promise).toMatchObject({ reason: "stale", summary: null });
    expect(miss.summarise).not.toHaveBeenCalled();
  });

  it("'Try again' skips the cache, but only for someone who may compute", async () => {
    const cache = { response: { summary: "• Old" }, cachedAt: "2026-11-18T10:00:00.000Z" };
    const forced = run({ force: true, cache });
    expect((await forced.promise).summary).toBe("• Shipped search");
    expect(forced.readCache).not.toHaveBeenCalled();
    const notAllowed = run({ force: true, canCompute: false, cache });
    expect((await notAllowed.promise).summary).toBe("• Old");
    expect(notAllowed.summarise).not.toHaveBeenCalled();
  });

  it("names the Slack digest, not the scan's AI write-up", () => {
    expect(describeDigestError("429 rate limit")).toContain("the Slack digest");
    expect(describeDigestError("429 rate limit")).not.toContain("AI write-up");
  });
});
