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
    expect(exported.length).toBeGreaterThanOrEqual(7);
    // EVERY exported entry point asserts — there is no longer an exception.
    // `getHandoverClientState` was the one, and it went with the derived half.
    const guarded = server.match(/assertAtLeastAdmin\(user\)/g) ?? [];
    expect(guarded.length).toBe(exported.length);
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
    // CLIENT is the only kind the board renders now; the rest survive so an
    // unfolded handover still parses on its way through `planFold`.
    expect([...HANDOVER_ITEM_KINDS]).toContain("CLIENT");
    expect([...HANDOVER_ITEM_STATUSES]).toEqual(["OPEN", "DONE", "BLOCKED"]);
    expect([...HANDOVER_STATUSES]).toEqual(["DRAFT", "ACTIVE", "ENDED"]);
  });
});

describe("handover — the derived half is gone, and stays gone", () => {
  const server = stripComments(read("src/server/handover.ts"));
  const types = stripComments(read("src/types/handover.ts"));

  /**
   * Live client state (overdue counts, Care queues) was computed on every read
   * and printed beside each item. Removed 24 Sep: against real data it read
   * `86 open · 17 overdue · 240 awaiting reply` on one line, which buried the
   * sentence it sat under. Re-adding it here costs five queries per read for a
   * payload no page opens, so the test names the cost rather than the style.
   */
  it("does not compute client state", () => {
    expect(server).not.toContain("getHandoverClientState");
    expect(server).not.toContain("getClientQueueSummaries");
    expect(types).not.toContain("HandoverClientState");
  });

  it("does not import Care", () => {
    expect(server).not.toMatch(/from "@\/server\/support"/);
  });

  /**
   * ⚠️ `Handover.standingRule` is a LIVE COLUMN that is deliberately unwritten.
   * Dropping it is a data-losing change and the guarded `prisma db push` skips
   * the WHOLE sync when the diff contains one (§2) — so the column stays and
   * the code must simply not touch it.
   */
  it("leaves the retired standingRule column alone", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("standingRule String?");
    expect(server).not.toMatch(/standingRule[:=]/);
    expect(stripComments(read("src/server/validators.ts"))).not.toContain("standingRule");
  });
});

describe("handover — the client board", () => {
  const detail = stripComments(read("src/components/backstage/handover-detail.tsx"));

  it("the two prose cards and the client grid are all there", () => {
    expect(detail).toContain('field="notes"');
    expect(detail).toContain('field="details"');
    expect(detail).toContain("<ClientCard");
    expect(detail).toContain("<ClientPanel");
  });

  it("the four-tab task list is gone", () => {
    // It read as a backlog. The reader opens ONE client; they do not scan four
    // lists for the lines that mention it.
    expect(detail).not.toContain("HANDOVER_SECTION_KINDS");
    expect(detail).not.toContain("ItemSection");
    expect(detail).not.toMatch(/aria-label="Handover sections"/);
  });

  it("renders nothing derived — no task counts, no Care, no status", () => {
    for (const forbidden of ["awaiting reply", "overdue", "openTasks", "useForeman", "clientState"]) {
      expect(detail, forbidden).not.toContain(forbidden);
    }
  });

  it("a client already on the board cannot be added twice", () => {
    // Two cards for one client is two places to write, and one gets missed.
    expect(detail).toMatch(/taken\.has\(c\.id\)/);
  });

  it("the popup edits all three paragraphs and can remove the client", () => {
    for (const label of ["Where we're at", "Duties", "Anything else"]) {
      expect(detail, label).toContain(label);
    }
    expect(detail).toMatch(/detail: draft\.summary/);
    expect(detail).toMatch(/duties: draft\.duties/);
    expect(detail).toMatch(/other: draft\.other/);
  });

  it("a failed delete clears the confirm rather than stranding the button", () => {
    // §50.8: left set, it reads "Remove this client?" for ever.
    expect(detail).toMatch(/\.catch\(\(\) => \{\s*\n?\s*setConfirmDelete\(false\);/);
  });

  it("the popup is the house fixed-height dialog", () => {
    // Otherwise it resizes under the cursor between a two-line client and a
    // two-page one — the rule DESIGN.md records for any dialog whose content varies.
    expect(detail).toContain("app-dialog-fixed");
  });
});

describe("handover — the fold runs on the ordinary read path", () => {
  const server = stripComments(read("src/server/handover.ts"));

  it("getHandover applies it, so nobody has to remember to", () => {
    // A migration behind a cron or a one-shot route is a migration that silently
    // never runs (the `jobs` worker and four other crons, docs/vps-crons.md).
    expect(server).toMatch(/await applyFoldIfNeeded\(row, workspaceId\)/);
  });

  it("is one transaction, and deletes what it consumed", () => {
    // Deleting is what makes it self-terminating. Writing the text first and in
    // the same transaction is what makes that safe.
    expect(server).toContain("prisma.$transaction");
    expect(server).toMatch(/deleteMany\(\{ where: \{ id: \{ in: plan\.consumedIds \} \} \}\)/);
  });

  it("re-reads after folding rather than patching the row in memory", () => {
    const block = server.slice(server.indexOf("applyFoldIfNeeded(row, workspaceId)"));
    expect(block.slice(0, 400)).toContain("prisma.handover.findFirst");
  });
});
