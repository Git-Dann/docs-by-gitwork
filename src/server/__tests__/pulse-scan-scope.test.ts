import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Who sees which Pulse scans.
 *
 * ── The defect this pins ─────────────────────────────────────────────────────
 * Scoping was `clientId IN (my assigned clients)`. A standalone URL scan has NO
 * clientId, so it could not match that filter for anyone scoped — and a GUEST, who has
 * no client assignments at all, resolved to `clientId IN ("__none__")` and saw an empty
 * list no matter how many scans they had just run.
 *
 * Scanning a prospect's URL is the entire reason a Pulse guest exists, so the account
 * was a dead end: run a scan, watch it vanish. Attribution existed (`triggeredByUserId`)
 * but was only written for mobile callers, because until now it only chose push targets.
 */

const ROOT = join(__dirname, "..", "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("a scoped viewer sees the scans they ran", () => {
  const pulse = read("src/server/pulse.ts");
  const route = read("src/app/api/pulse/scans/route.ts");

  it("ORs 'I ran it' alongside the client filter", () => {
    expect(pulse).toMatch(/OR: \[scopedByClient, \{ triggeredByUserId: mine \}\]/);
  });

  it("does NOT widen an unscoped viewer", () => {
    // clientIds === null means "sees everything" (admin, staff with seeAllClients, or
    // the trusted API_KEY). Adding an OR there would be meaningless and misleading.
    expect(pulse).toMatch(/scopedByClient\s*\n?\s*\?\s*mine/);
    expect(route).toMatch(/triggeredByUserId: clientIds \? \(user\?\.id \?\? null\) : null/);
  });

  it("attributes a WEB scan to the person who ran it, not only a mobile one", () => {
    // The list now scopes on this field, so an unattributed scan is one its author
    // cannot find.
    expect(route).toMatch(/triggeredByUserId: requestUser\?\.id \?\? scanUser\?\.id \?\? null/);
  });

  it("keeps the empty-assignment sentinel on EVERY scoped query", () => {
    // `clientId IN []` matches nothing in Prisma, but an empty `in` is the kind of thing
    // that gets "simplified" away — and doing so shows every scan in the workspace to a
    // viewer who should see none.
    //
    // ⚠️ Counted, not merely matched. The first version of this assertion was
    // `toMatch(/\["__none__"\]/)`, and deleting the sentinel from listPulseScans left it
    // GREEN because getPulsePortfolio carries its own copy. A test that passes whether
    // or not the bug is present is not covering it (§42.10).
    const guards = [...pulse.matchAll(/params\.clientIds\.length \? params\.clientIds : \["__none__"\]/g)];
    expect(guards.length, "every clientIds filter needs the empty-set guard").toBe(2);
  });
});
