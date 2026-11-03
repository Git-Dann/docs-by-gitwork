import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// First-time setup (schema patches, seeds, backfills) used to start on whichever request came
// first. It now starts at server start-up (src/instrumentation-node.ts), so Phase 2.2 can remove
// ensureBaseRecords() call sites without risking setup never running. CLAUDE.md §88.

const runFirstBootSetup = vi.fn(async () => ({ workspace: { id: "w1" } }));

vi.mock("@/server/bootstrap", () => ({ runFirstBootSetup }));
vi.mock("@/lib/github", () => ({ setGithubCacheStore: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $connect: vi.fn(async () => undefined) } }));
vi.mock("@/server/github-cache-store", () => ({ createGithubCacheStore: vi.fn(() => ({})) }));

const saved = { ...process.env };

async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  runFirstBootSetup.mockClear();
  for (const k of ["DATABASE_URL", "NEXT_PHASE"]) delete process.env[k];
  Object.assign(process.env, env);
  const mod = await import("@/instrumentation-node");
  // Let the dynamic import and its .then chain settle.
  await new Promise((r) => setTimeout(r, 20));
  return mod;
}

afterEach(() => {
  process.env = { ...saved };
});

describe("first-time setup starts at server start-up", () => {
  it("starts it when there is a database", async () => {
    await loadWith({ DATABASE_URL: "postgres://x" });
    expect(runFirstBootSetup).toHaveBeenCalledTimes(1);
  });

  it("does not start it without a database", async () => {
    await loadWith({});
    expect(runFirstBootSetup).not.toHaveBeenCalled();
  });

  it("does not start it during next build", async () => {
    await loadWith({ DATABASE_URL: "postgres://x", NEXT_PHASE: "phase-production-build" });
    expect(runFirstBootSetup).not.toHaveBeenCalled();
  });

  it("a failed start-up run is logged, never thrown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    runFirstBootSetup.mockRejectedValueOnce(new Error("db down"));
    await loadWith({ DATABASE_URL: "postgres://x" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("db down"));
    warn.mockRestore();
  });

  it("shouldRunFirstBootSetup decides on the two variables only", async () => {
    const { shouldRunFirstBootSetup } = await loadWith({});
    expect(shouldRunFirstBootSetup({ DATABASE_URL: "x" })).toBe(true);
    expect(shouldRunFirstBootSetup({})).toBe(false);
    expect(
      shouldRunFirstBootSetup({ DATABASE_URL: "x", NEXT_PHASE: "phase-production-build" }),
    ).toBe(false);
  });
});

describe("ensureBaseRecords and runFirstBootSetup share one run", () => {
  const src = readFileSync("src/server/bootstrap.ts", "utf8");

  it("ensureBaseRecords only delegates to the memoised setup", () => {
    const body = src.match(/export async function ensureBaseRecords\(\)[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(body.trim()).toBe("return runFirstBootSetup();");
  });

  it("the memo lives in runFirstBootSetup", () => {
    const body = src.match(/export async function runFirstBootSetup\(\)[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(body).toMatch(/baseRecordsPromise \?\?= _ensureBaseRecords\(\)/);
    expect(body).toMatch(/baseRecordsPromise = null;/);
  });
});
