import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Every `/api/pulse/scans/[scanId]/*` route must check the caller may touch that scan.
 *
 * ── Why a directory sweep and not twelve assertions ──────────────────────────
 * Each of these took the id from the URL and acted on it with NO check: retry, cancel,
 * re-analyse, diff, history, benchmarks, generate-proposal, share, pdf, email, the SSE
 * stream. Several SPEND TOKENS or WRITE. Gating the parent GET while the siblings stayed
 * open was no gate at all — and the reason they were all missing it is that nothing made
 * a new route inherit the rule.
 *
 * So the test enumerates the DIRECTORY. A route added next year is covered the day it
 * lands, which is the only version of this that keeps working.
 */

const ROOT = join(__dirname, "..", "..", "..");
const DIR = join(ROOT, "src/app/api/pulse/scans/[scanId]");

const subroutes = readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(DIR, e.name, "route.ts")))
  .map((e) => e.name);

describe("every scan sub-route is access-checked", () => {
  it("found the routes (a sweep that matches nothing passes vacuously)", () => {
    expect(subroutes.length).toBeGreaterThanOrEqual(10);
  });

  it.each(subroutes)("%s calls assertPulseScanAccess", (sub) => {
    const src = readFileSync(join(DIR, sub, "route.ts"), "utf8");
    expect(
      src.includes("await requireScanAccess(request, scanId)"),
      `${sub} acts on a caller-supplied scanId without checking the caller may see it`,
    ).toBe(true);
  });

  it.each(subroutes)("%s passes the real request, so the caller can be resolved", (sub) => {
    // `requireScanAccess` resolves the user itself; handing it a request the handler
    // renamed to `_request` would not compile, but a stray literal would.
    const src = readFileSync(join(DIR, sub, "route.ts"), "utf8");
    expect(src).toMatch(/requireScanAccess\(request, scanId\)/);
  });
});

describe("visibility is not permission", () => {
  const read = (sub: string) => readFileSync(join(DIR, sub, "route.ts"), "utf8");

  it("generate-proposal needs the Docs grant, not just sight of the scan", () => {
    // It WRITES a Document into a module a guest does not hold.
    expect(read("generate-proposal")).toMatch(/assertCan\([\s\S]{0,80}?canManageDocs/);
  });

  it("re-analysing needs the AI grant, because it spends tokens", () => {
    expect(read("reanalyse")).toMatch(/assertCan\([\s\S]{0,80}?canGenerateAi/);
  });

  it("the SSE stream cannot use fromError, so it returns its own 404", () => {
    const src = read("stream");
    expect(src).toMatch(/catch \{\s*\n?\s*return new Response\("Scan not found", \{ status: 404 \}\)/);
  });
});

describe("NotFoundError carries its status", () => {
  it("is 404, and fromError maps it", () => {
    const eu = readFileSync(join(ROOT, "src/server/auth/effective-user.ts"), "utf8");
    expect(eu).toMatch(/class NotFoundError extends Error \{\s*\n\s*status = 404;/);
    // fromError reads `error.status` — that is what turns the throw into a 404 body.
    expect(readFileSync(join(ROOT, "src/lib/api-response.ts"), "utf8")).toMatch(/status\?: unknown/);
  });
});
