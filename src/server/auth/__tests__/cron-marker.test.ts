/**
 * The scheduler's "this job ran" marker actually lands — recorded through `after()`.
 *
 * `assertCron` is synchronous and called by ~21 route handlers, so it cannot await the write.
 * Work merely started during a request is not guaranteed to run once the response has been
 * sent, so the marker goes through `after()`, which is guaranteed to finish (§36). These tests
 * lock that: the marker is recorded, it is recorded for the right job name, a path that is not
 * a cron route records nothing, and bookkeeping never fails the request.
 *
 * ⚠️ READ THIS BEFORE TRUSTING THE ORIGINAL RATIONALE. The first version of this file claimed
 * the preceding `void markSystem(...)` was why no marker ever landed and why the watchdog
 * answered 503, and said the box's cron log showed every job running. **That was false.** The
 * cause was §145: a 0-byte `run-cron.sh` shipped on 20 Nov, so for two days nothing called the
 * cron routes at all — `assertCron` was never reached, and the `void` form was never shown to
 * be at fault. The cron log had simply stopped being written to, and #894 read it as current.
 *
 * The watchdog was right the whole time. The tests below are still worth having, because
 * "the marker lands" is a real behaviour to lock; only the story about why was wrong.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const marked: string[] = [];
const afterCalls: Array<() => unknown> = [];

vi.mock("@/server/system-markers", () => ({
  markSystem: vi.fn(async (name: string) => {
    marked.push(name);
  }),
}));

vi.mock("next/server", () => ({
  after: vi.fn((fn: () => unknown) => {
    afterCalls.push(fn);
  }),
}));

// `effective-user` pulls in next-auth, which imports `next/server` itself — and mocking that
// module then breaks ITS resolution. Only `UnauthorizedError` is needed here.
vi.mock("@/server/auth/effective-user", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
  },
}));

import { after } from "next/server";
import { assertCron } from "@/server/auth/cron";

const SECRET = "test-cron-secret";
const call = (path: string) =>
  assertCron(new Request(`https://foundry.example${path}`, { headers: { Authorization: `Bearer ${SECRET}` } }));

beforeEach(() => {
  marked.length = 0;
  afterCalls.length = 0;
  vi.mocked(after).mockClear();
  process.env.CRON_SECRET = SECRET;
});

describe("the cron run marker", () => {
  it("is scheduled through after(), not left as a bare un-awaited promise", async () => {
    call("/api/cron/jobs");
    // The marker must be handed to `after()`. Nothing may have been written yet — the point of
    // `after()` is that it runs once the response is out.
    expect(after, "assertCron must schedule the marker with after()").toHaveBeenCalledTimes(1);
    expect(afterCalls).toHaveLength(1);

    await afterCalls[0]();
    expect(marked).toEqual(["cron:jobs"]);
  });

  it("records the job's own name, which is what the watchdog reads back", async () => {
    for (const name of ["wiki-monitors", "wedge-keepwarm", "pulse-reconcile"]) {
      call(`/api/cron/${name}`);
    }
    await Promise.all(afterCalls.map((fn) => fn()));
    expect(marked).toEqual(["cron:wiki-monitors", "cron:wedge-keepwarm", "cron:pulse-reconcile"]);
  });

  it("still works when there is no request scope — bookkeeping never fails the job", async () => {
    vi.mocked(after).mockImplementationOnce(() => {
      throw new Error("`after()` was called outside a request scope");
    });
    expect(() => call("/api/cron/jobs")).not.toThrow();
    // It fell back to writing directly rather than dropping the marker.
    await vi.waitFor(() => expect(marked).toEqual(["cron:jobs"]));
  });

  it("writes nothing for a path that is not a cron route", () => {
    assertCron(new Request("https://foundry.example/api/health", { headers: { Authorization: `Bearer ${SECRET}` } }));
    expect(after).not.toHaveBeenCalled();
    expect(marked).toEqual([]);
  });

  it("records nothing when the call is not authorised", () => {
    expect(() =>
      assertCron(new Request("https://foundry.example/api/cron/jobs", { headers: { Authorization: "Bearer wrong" } })),
    ).toThrow();
    expect(after).not.toHaveBeenCalled();
    expect(marked).toEqual([]);
  });
});
