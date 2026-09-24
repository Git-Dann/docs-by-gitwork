import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HANDOVER_ITEM_KINDS,
  HANDOVER_ITEM_STATUSES,
  HANDOVER_KIND_META,
  HANDOVER_STATUSES,
} from "@/types/handover";

/**
 * A feature with several parallel allow-lists breaks by being added to some of
 * them (§43.1). Handover has five that TypeScript cannot check, because they are
 * string sets and object literals rather than exhaustive `Record` maps:
 *
 *   1. `BackstageArea`            the union
 *   2. `AREA_LABEL`               the breadcrumb (this one IS exhaustive)
 *   3. `AREAS`                    the `?area=` deep-link allow-list
 *   4. the render dispatch        `{area === "handover" ? ... }`
 *   5. the overview card          the only way in without a deep link
 *
 * Miss 3 and a deep link silently bounces to the overview. Miss 5 and the area
 * is unreachable. Both are invisible to `tsc`, `lint` and every runtime test.
 *
 * Source-text assertions on purpose: these live in "use client" components whose
 * imports drag a React tree into a node test for no benefit.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// Strip comments first — an assertion that matches the sentence explaining a
// rule rather than the rule itself passes with the rule deleted. That has
// happened five times in this codebase; it is the default failure of this
// style of test, not an edge case.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("handover — Backstage wiring", () => {
  const workspace = stripComments(read("src/components/backstage/backstage-workspace.tsx"));
  const overview = stripComments(read("src/components/backstage/backstage-overview.tsx"));

  it("is a member of the BackstageArea union", () => {
    expect(overview).toMatch(/export type BackstageArea =[^;]*"handover"/);
  });

  it("has a breadcrumb label", () => {
    expect(workspace).toMatch(/handover:\s*"Handover"/);
  });

  it("is in the ?area= deep-link allow-list", () => {
    const set = workspace.match(/new Set<BackstageArea>\(\[[^\]]*\]\)/)?.[0] ?? "";
    expect(set).toContain('"handover"');
  });

  it("is actually rendered", () => {
    expect(workspace).toMatch(/area === "handover" \? <HandoverTab \/>/);
  });

  it("has a card on the overview, so it is reachable without a deep link", () => {
    expect(overview).toContain("<HandoverCard");
    expect(overview).toMatch(/area="handover"/);
  });

  /**
   * ⚠️ The gate must be `isAdmin`, matching the server's `assertAtLeastAdmin`.
   * `canApprove` is wider — it also admits `backstage.approve` holders — so
   * gating the UI on it would show a non-admin a screen whose every request the
   * API then refuses, which reads as a broken page rather than a closed door.
   */
  it("gates on isAdmin, not canApprove", () => {
    expect(workspace).toMatch(/area === "handover" && !isAdmin/);
    expect(workspace).not.toMatch(/area === "handover" && !canApprove/);
    expect(overview).toMatch(/isAdmin \? <HandoverCard/);
  });

  it("the server gate is assertAtLeastAdmin on every exported entry point", () => {
    const server = stripComments(read("src/server/handover.ts"));
    const exported = server.match(/export async function \w+/g) ?? [];
    expect(exported.length).toBeGreaterThanOrEqual(8);
    // Every one of them must assert. `getHandoverClientState` is the one exception:
    // it takes a workspaceId rather than a user and is only ever called from
    // getHandover, which has already asserted.
    const guarded = server.match(/assertAtLeastAdmin\(user\)/g) ?? [];
    expect(guarded.length).toBe(exported.length - 1);
  });
});

describe("handover — the kinds are declared once", () => {
  it("every kind has the copy the page renders", () => {
    for (const kind of HANDOVER_ITEM_KINDS) {
      const meta = HANDOVER_KIND_META[kind];
      expect(meta?.label, kind).toBeTruthy();
      expect(meta?.blurb, kind).toBeTruthy();
      // The empty state matters more here than usual: an empty DUTY section does
      // not mean there are no standing duties, it means nobody has written them
      // down, and those are opposite facts.
      expect(meta?.empty, kind).toBeTruthy();
    }
  });

  it("validators read the unions rather than restating them", () => {
    const validators = stripComments(read("src/server/validators.ts"));
    expect(validators).toContain("z.enum(HANDOVER_ITEM_KINDS)");
    expect(validators).toContain("z.enum(HANDOVER_ITEM_STATUSES)");
    expect(validators).toContain("z.enum(HANDOVER_STATUSES)");
    // A restated literal list is how a kind gets added to the UI and rejected at
    // the edge with a bare "Validation failed".
    expect(validators).not.toMatch(/z\.enum\(\["DECISION"/);
  });

  it("the unions are what the page and the schema agree on", () => {
    expect([...HANDOVER_ITEM_KINDS]).toEqual(["DECISION", "RISK", "DUTY", "CLIENT"]);
    expect([...HANDOVER_ITEM_STATUSES]).toEqual(["OPEN", "DONE", "BLOCKED"]);
    expect([...HANDOVER_STATUSES]).toEqual(["DRAFT", "ACTIVE", "ENDED"]);
  });
});

describe("handover — derived state is never frozen", () => {
  const server = stripComments(read("src/server/handover.ts"));

  it("getHandover stamps asOf from the clock, not from the row", () => {
    expect(server).toMatch(/asOf: new Date\(\)\.toISOString\(\)/);
  });

  it("client state is recomputed inside getHandover, not stored", () => {
    expect(server).toMatch(/clientState: await getHandoverClientState\(workspaceId\)/);
    const schema = read("prisma/schema.prisma");
    const model = schema.slice(schema.indexOf("model Handover {"), schema.indexOf("model HandoverItem {"));
    // A stored copy would be correct exactly once. Any of these columns appearing
    // on the model means the derived half has been frozen into the authored one.
    expect(model).not.toMatch(/clientState|openTasks|careAwaiting|derived/i);
  });

  it("reuses Care's own roll-up rather than counting again", () => {
    // Two copies of the awaiting-reply predicate would let the handover and the
    // Care cockpit report different numbers for the same client (§42.6).
    // ⚠️ Assert the CALL, not the identifier. `toContain("getClientQueueSummaries")`
    // is satisfied by the import line alone, so it passed with the call replaced —
    // caught by sabotage, and the same trap §42.15 records.
    expect(server).toMatch(/await getClientQueueSummaries\(\)|getClientQueueSummaries\(\),/);
    expect(server).not.toContain("replyStateWhere");
  });

  it("links Care to Portal by workspaceClientId, never by name", () => {
    // The same client is `wedge` in Portal and "Big Wedge Golf" in Care (§42.15).
    expect(server).toMatch(/workspaceClientId: \{ in: clientIds \}/);
  });

  it("counts live work the way every other progress calculation does", () => {
    // Without `parentId: null, archivedAt: null` subtasks double-count and
    // archived work resurfaces — the bug backstage-timeline.ts still carries.
    expect(server).toMatch(/archivedAt: null,\s*\n\s*parentId: null,/);
  });
});
