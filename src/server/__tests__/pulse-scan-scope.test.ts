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

describe("a guest's scan is their own, never filed against a Gitwork client", () => {
  const route = read("src/app/api/pulse/scans/route.ts");
  const newPage = read("src/app/(app)/app/pulse/new/page.tsx");
  const form = read("src/components/pulse/pulse-new-scan-form.tsx");

  it("does not offer clients the viewer has no access to", () => {
    // This page is a server component that listed EVERY WorkspaceClient by name and
    // handed it to the form — Gitwork's whole client roster, in a dropdown, to a guest.
    expect(newPage).toMatch(/assignments: \{ some: \{ userId: viewer\.userId \} \}/);
    expect(
      /where: \{ workspaceId: workspace\.id \},\s*\n\s*select: \{ id: true, name: true \}/.test(
        newPage.replace(/seesAllClients[\s\S]*?orderBy: \{ name: "asc" \},\s*\}\)/, ""),
      ),
      "the unscoped findMany must only survive on the sees-all-clients branch",
    ).toBe(false);
  });

  it("refuses a clientId the caller may not use, whatever the picker offered", () => {
    // The body is caller-controlled. A picker that does not list a client is not a
    // control over what can be posted.
    expect(route).toMatch(/if \(body\.clientId\) await assertClientAccess\(scanUser, body\.clientId\)/);
  });

  it("validates AFTER parsing the body, not before", () => {
    // Ordering matters and tsc caught it once already: referencing `body` above its
    // own declaration is a TDZ error, so the check has to follow the parse.
    // ⚠️ Anchor on the CALL, not the bare name — `indexOf("assertClientAccess")`
    // finds the import on line 5 and reports the order backwards.
    expect(route.indexOf("pulseScanCreateSchema.parse")).toBeLessThan(
      route.indexOf("await assertClientAccess(scanUser"),
    );
  });

  it("leaves the scan unattributed when no client is chosen", () => {
    // The default, and for a guest the only, path: empty string → undefined → null.
    expect(form).toMatch(/clientId: clientId \|\| undefined/);
    expect(form).toMatch(/clients\.length > 0 &&/);
  });
});

describe("the scan DETAIL is scoped like the list", () => {
  const detail = read("src/app/api/pulse/scans/[scanId]/route.ts");
  const pulse = read("src/server/pulse.ts");

  it("checks visibility at all", () => {
    // The GET had no check whatsoever: any signed-in account could read any scan in
    // the workspace given its id. A scoped list over an open row is not scoping.
    expect(detail).toMatch(/canViewPulseScan\(viewer, scanId/);
  });

  it("answers 404, not 403, so an id probe learns nothing", () => {
    // Same trap: the first "canViewPulseScan" in the file is its import.
    const at = detail.indexOf("await canViewPulseScan(");
    expect(at, "the visibility call is missing").toBeGreaterThan(-1);
    const block = detail.slice(at, at + 200);
    expect(block).toMatch(/404/);
    expect(block).not.toMatch(/403/);
  });

  it("applies the same rule as the list — mine, or my client's", () => {
    expect(pulse).toMatch(/row\.triggeredByUserId === user\.id/);
    expect(pulse).toMatch(/if \(!row\.clientId\) return false/);
  });

  it("does not put the authorisation field on the browser DTO", () => {
    // Widening PulseScanRecord to authorise would ship it to every client.
    expect(
      /triggeredByUserId/.test(read("src/types/pulse.ts")),
      "keep the auth input off the wire format",
    ).toBe(false);
  });
});

describe("internal-only wins over a module grant", () => {
  const gate = read("src/server/auth/module-gate.ts");

  it("denies /app/pulse/embed to a guest who holds the pulse module", () => {
    expect(gate).toMatch(/"\/app\/pulse\/embed"/);
  });

  it("evaluates the deny BEFORE the grant", () => {
    // /app/pulse/embed matches MODULE_PATHS on `pulse`, so a grant checked first would
    // return true and never reach the restriction.
    const fn = gate.slice(gate.indexOf("export function hasModuleAccess"));
    expect(fn.indexOf("INTERNAL_ONLY_PREFIXES")).toBeLessThan(fn.indexOf("moduleForPath"));
  });
});
