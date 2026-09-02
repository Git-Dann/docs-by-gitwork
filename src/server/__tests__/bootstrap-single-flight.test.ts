import { describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// `ensureBaseRecords` used to cache the resolved VALUE, so on a cold container
// every request arriving before the first one finished started its own bootstrap.
// A check-then-act race across the whole of `_ensureBaseRecords`, with two
// consequences observed in production:
//
//   · three CREATE INDEX IF NOT EXISTS failing 23505 on every boot (both callers
//     passed the existence check, then collided writing pg_class)
//   · 13 DUPLICATE built-in Starters across 12 slugs — four starter seeders, each
//     an upsert-by-slug, run concurrently: both read "not present", both insert.
//     The affected slug moved between observations, i.e. a different race per boot.
//
// This pins the single-flight property on the same shape as the real function,
// because importing bootstrap.ts pulls in Prisma and the whole seeding tree.
// ─────────────────────────────────────────────────────────────────────────────

/** The exact memoisation shape bootstrap.ts uses. */
function makeSingleFlight<T>(work: () => Promise<T>) {
  let cache: T | null = null;
  let inflight: Promise<T> | null = null;
  return async function ensure(): Promise<T> {
    if (cache) return cache;
    inflight ??= work().then(
      (v) => { cache = v; return v; },
      (e) => { inflight = null; throw e; },
    );
    return inflight;
  };
}

/** The old shape, kept so the test proves the difference rather than asserting it. */
function makeValueCached<T>(work: () => Promise<T>) {
  let cache: T | null = null;
  return async function ensure(): Promise<T> {
    if (cache) return cache;
    cache = await work();
    return cache;
  };
}

describe("bootstrap runs its seeding exactly once under concurrency", () => {
  it("collapses simultaneous cold-start callers into one run", async () => {
    const work = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10)); // seeding takes real time
      return { workspace: { id: "w1" } };
    });
    const ensure = makeSingleFlight(work);

    const results = await Promise.all(Array.from({ length: 25 }, () => ensure()));

    expect(work).toHaveBeenCalledTimes(1);
    // And every caller gets the same object, not 25 competing bootstraps.
    for (const r of results) expect(r).toBe(results[0]);
  });

  it("the old value-caching shape really did run it 25 times", async () => {
    // Not a hypothetical: this is what produced the duplicate Starters.
    const work = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { workspace: { id: "w1" } };
    });
    const ensure = makeValueCached(work);

    await Promise.all(Array.from({ length: 25 }, () => ensure()));

    expect(work).toHaveBeenCalledTimes(25);
  });

  it("still serves from cache after the first run settles", async () => {
    const work = vi.fn(async () => ({ workspace: { id: "w1" } }));
    const ensure = makeSingleFlight(work);
    await ensure();
    await ensure();
    await ensure();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("lets a later request retry after a failure", async () => {
    // Without clearing the memo, one transient DB blip would poison the container
    // for its entire lifetime.
    let attempt = 0;
    const work = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error("transient");
      return { workspace: { id: "w1" } };
    });
    const ensure = makeSingleFlight(work);

    await expect(ensure()).rejects.toThrow("transient");
    await expect(ensure()).resolves.toEqual({ workspace: { id: "w1" } });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("rejects every concurrent caller when the single run fails", async () => {
    const work = vi.fn(async () => { throw new Error("boom"); });
    const ensure = makeSingleFlight(work);
    const settled = await Promise.allSettled([ensure(), ensure(), ensure()]);
    expect(settled.every((s) => s.status === "rejected")).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
  });
});

describe("the real bootstrap uses this shape", () => {
  it("memoises the promise, not the resolved value", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/server/bootstrap.ts", "utf8"));
    expect(src).toMatch(/baseRecordsPromise/);
    expect(src).toMatch(/baseRecordsPromise \?\?=/);
    // And clears the memo on failure so a retry is possible.
    expect(src).toMatch(/baseRecordsPromise = null;/);
    // The old bug, in one line: awaiting straight into the value cache.
    expect(src).not.toMatch(/baseRecordsCache = await _ensureBaseRecords\(\)/);
  });
});
