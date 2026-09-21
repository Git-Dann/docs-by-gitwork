import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Routes that describe GITWORK must refuse an external caller.
 *
 * ── How these were found, which is the point ─────────────────────────────────
 * Not by reading. Every one of them had been read — several in the same session that
 * gated the PAGE in front of them — and they still looked fine, because "requires a
 * session" and "requires a colleague" were the same sentence until GUEST existed.
 *
 * They were found by signing in as a real guest and calling the API. `/api/team/members`
 * returned all 30 teammates with their email addresses; `/api/proposals` returned ten
 * client documents. Both sat behind pages that were correctly gated, which is exactly
 * what made them invisible.
 *
 * ⚠️ The lesson worth keeping is about METHOD: a gated page says nothing about the route
 * behind it, and reading a route does not tell you what it returns. Probe the surface
 * with a real account of the least-privileged kind.
 */

const ROOT = join(__dirname, "..", "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

/** Route → the guard its GET must carry, and why it is not merely "authed". */
const GUARDED: Array<[string, RegExp, string]> = [
  [
    "src/app/api/team/members/route.ts",
    /assertInternal\(await getEffectiveUserOrNull\(request\)\)/,
    "every teammate, with email addresses",
  ],
  [
    "src/app/api/proposals/route.ts",
    /assertCan\([\s\S]{0,80}?canViewDocs/,
    "client documents — proposals, SLAs, SOWs",
  ],
  [
    "src/app/api/onboarding-forms/route.ts",
    /assertInternal\(await getEffectiveUserOrNull\(request\)\)/,
    "our client-onboarding templates",
  ],
  [
    "src/app/api/snippets/route.ts",
    /assertInternal\(await getEffectiveUserOrNull\(request\)\)/,
    "the Docs content library",
  ],
  [
    "src/app/api/pulse/leads/route.ts",
    /assertInternal\(await getEffectiveUserOrNull\(request\)\)/,
    "captured lead email addresses",
  ],
  [
    "src/app/api/pulse/stats/route.ts",
    /assertInternal\(await getEffectiveUserOrNull\(request\)\)/,
    "the whole client portfolio's health",
  ],
];

describe("internal data is refused to an external caller", () => {
  it.each(GUARDED)("%s is guarded", (file, guard, what) => {
    expect(read(file), `${file} returns ${what} — it must refuse a guest`).toMatch(guard);
  });

  it("guards the GET, not only a mutation further down the file", () => {
    // A route whose POST is gated and whose GET is not reads as protected at a glance.
    for (const [file, guard] of GUARDED) {
      const src = read(file);
      const get = src.indexOf("export async function GET");
      expect(get, `${file} has no GET`).toBeGreaterThan(-1);
      const nextExport = src.indexOf("export async function", get + 10);
      const body = src.slice(get, nextExport === -1 ? undefined : nextExport);
      expect(guard.test(body), `${file}: the guard is outside the GET handler`).toBe(true);
    }
  });
});

describe("canViewDocs is a read gate, not the manage action", () => {
  it("asks for the module, so reading a SOW does not imply deleting one", () => {
    expect(read("src/server/auth/effective-user.ts")).toMatch(
      /export function canViewDocs\(user: EffectiveUser\): boolean \{\s*\n\s*return can\(user, "proposals"\);/,
    );
  });
});
