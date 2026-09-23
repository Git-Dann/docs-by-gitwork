/**
 * Guards for the client summary board that a type-check cannot see.
 *
 * `/app/portal/summary` is auth-gated with no staging, so the board was verified by
 * driving `/demo/summary` in a real browser. These pin the four things that pass
 * lands found — three of which look correct in the source until the page is rendered.
 *
 * Source assertions rather than a render: the board is a client component over three
 * hooks, and mocking them to re-check the ORDER of two elements would test the mocks.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const BOARD = read("src/components/clients/client-summary-board.tsx");
const SERVER = read("src/server/client-summary.ts");
const CLIENTS = read("src/server/clients.ts");
const PATCH_ROUTE = read("src/app/api/clients/summary/[clientId]/route.ts");

describe("the note is the card's content, not a footnote", () => {
  /**
   * ⚠️ The first cut stacked three derived sentences above a dashed "Add a note…" box,
   * and the question it produced on sight was "where do I type?". The page exists to
   * carry what a person writes about a client, so that has to lead.
   */
  it("previews the update in two lines and keeps the detail one click away", () => {
    /**
     * The card is a preview, not the record. The figures and the derived flag strip
     * moved into `CardDetail`: as an overview they crowded out the only thing on the
     * card a person writes, and as detail they are what you want once it catches your
     * eye. The whole card is the control, so nothing inside it is separately clickable.
     */
    const card = BOARD.slice(BOARD.indexOf("function Card("), BOARD.indexOf("export function ClientSummaryBoardView"));
    expect(card).toContain("line-clamp-2");
    expect(card).toContain("<CardDetail");
    expect(card, "the card should not render figures").not.toContain("<Figure");
    expect(card, "the card should not hold the editor").not.toContain("<NoteEditor");
  });

  it("does not hide the full update behind a tooltip", () => {
    // ⚠️ A `title` on the clamped text is unreachable on a touch device, and a
    // truncation with no recoverable path is a defect under audit:clipping.
    const card = BOARD.slice(BOARD.indexOf("function Card("), BOARD.indexOf("export function ClientSummaryBoardView"));
    const clamp = card.slice(card.indexOf("line-clamp-2") - 200, card.indexOf("line-clamp-2") + 200);
    expect(clamp).not.toContain("title={card.note}");
  });

  it("keeps ALL the figures and the flags in the detail view", () => {
    // ⚠️ `toContain("<Figure")` alone passes with three of the four deleted — it was
    // written that way first, and a sabotage that removed one figure fired nothing.
    const detail = BOARD.slice(
      BOARD.indexOf("function CardDetail("),
      BOARD.indexOf("function Card("),
    );
    for (const label of ["Done / 7d", "In flight", "To do", "Devs"]) {
      expect(detail, `the detail view lost the "${label}" figure`).toContain(label);
    }
    expect(detail).toContain("card.reasons.join");
    expect(detail).toContain("<NoteEditor");
  });

  it("puts the derived signals on the status dot rather than dropping them", () => {
    // ⚠️ Removed from sight is not the same as removed. The dot is the only thing on
    // the card saying a client is red, so WHY has to stay reachable from it.
    const card = BOARD.slice(
      BOARD.indexOf("function Card("),
      BOARD.indexOf("export function ClientSummaryBoardView"),
    );
    expect(card).toMatch(/title=\{[\s\S]{0,200}card\.reasons\.join/);
  });

  it("spends the header's right-hand slot on a fact, not on the dot repeated", () => {
    // "NEEDS ATTENTION" beside a red dot says the same thing twice and spends the only
    // slot on the card that could carry something the dot cannot.
    const card = BOARD.slice(
      BOARD.indexOf("function Card("),
      BOARD.indexOf("export function ClientSummaryBoardView"),
    );
    const status = card.slice(card.indexOf("widget-header__status"), card.indexOf("widget-header__status") + 220);
    expect(status).toContain("card.devCount");
    expect(status, "the status label belongs in the detail view, not on the card").not.toContain(
      "tone.label",
    );
  });

  it("offers an explicit invitation when there is nothing written yet", () => {
    expect(BOARD).toContain("Write an update");
  });

  it("keeps the textarea at 16px on a phone so iOS Safari does not zoom on focus", () => {
    // Same rule as `onboarding/field-renderer.tsx` — under 16px, focusing the field
    // zooms the viewport and shoves the board half off-screen.
    const open = BOARD.indexOf("<textarea");
    expect(open, "the editor should be a textarea").toBeGreaterThan(-1);
    const editor = BOARD.slice(open, BOARD.indexOf("/>", open) + 2);
    expect(editor).toContain("className");
    expect(editor).toMatch(/text-base/);
    expect(editor).not.toMatch(/(^|[\s"])text-\[1[0-5]px\]/);
    expect(editor).not.toMatch(/(^|[\s"])text-(sm|xs)\b/);
  });
});

describe("a summary write cannot escape the workspace", () => {
  /**
   * ⚠️ The client id arrives from the browser. A bare `update({ where: { id } })` would
   * let anyone holding `canManageClients` write a row in any workspace —
   * `updateClientRecord` keys on `workspaceId_slug` for exactly this reason.
   */
  it("scopes the write with updateMany + workspaceId", () => {
    const fn = SERVER.slice(SERVER.indexOf("async function updateSummaryFields"));
    expect(fn).toContain("updateMany");
    expect(fn).toContain("workspaceId: workspace.id");
  });

  it("does not update a WorkspaceClient by bare id anywhere in this module", () => {
    expect(SERVER).not.toMatch(/workspaceClient\.update\(/);
  });

  it("reports a write that matched no row, rather than answering ok", () => {
    // A silent 200 would show the edit vanishing on the next refetch, unexplained.
    expect(PATCH_ROUTE).toMatch(/if \(!found\) return apiError\(/);
  });
});

describe("the static /summary segment cannot be stolen by a client slug", () => {
  /**
   * ⚠️ `summary` is a static segment and wins over `[slug]` in Next's routing, so a
   * client actually slugged "summary" would be unreachable through its own pages.
   */
  it("refuses 'summary' as a client slug", () => {
    expect(CLIENTS).toMatch(/RESERVED_CLIENT_SLUGS[\s\S]{0,120}"summary"/);
    expect(CLIENTS).toMatch(/RESERVED_CLIENT_SLUGS\.has\(/);
  });
});

describe("the portfolio card", () => {
  const SERVER_SRC = read("src/server/client-summary.ts");

  it("counts distinct people, never a sum of the per-client figures", () => {
    /**
     * ⚠️ A developer routinely works across two or three clients, so `sum(devCount)`
     * counts placements. A board reading "31 devs" over a team of nineteen is a number
     * nobody can reconcile against the payroll.
     */
    const METRICS = read("src/server/client-metrics.ts");
    const fn = METRICS.slice(METRICS.indexOf("export async function computeDistinctDevCount"));
    expect(fn.slice(0, 400)).toContain('by: ["candidateId"]');
    const board = BOARD.slice(BOARD.indexOf("export function ClientSummaryBoardView"));
    expect(board, "the UI must not add the per-client counts up itself").not.toMatch(
      /reduce\([\s\S]{0,80}devCount/,
    );
  });

  it("uses the SAME definition of an active dev as the per-client counts", () => {
    /**
     * ⚠️ This was live and wrong for one deploy. The portfolio query omitted two
     * filters the per-client counts apply — the candidate's workspace, and excluding
     * pro-bono devs — so production reported 17 distinct people over per-client counts
     * summing to 15: a total LARGER than its own parts. Both now build their `where`
     * from one function, so they cannot drift apart again.
     */
    const METRICS = read("src/server/client-metrics.ts");
    const shared = METRICS.slice(METRICS.indexOf("export function activeDevPlacementWhere"));
    expect(shared.slice(0, 400)).toContain(
      'candidate: { workspaceId, devGroup: { not: "PRO_BONO" } }',
    );
    expect(shared.slice(0, 400)).toContain("endDate: null");

    for (const caller of ["computeDistinctDevCount", "computeClientDevCounts"]) {
      const fn = METRICS.slice(METRICS.indexOf(`export async function ${caller}`));
      const head = fn.slice(0, 600);
      expect(head, `${caller} should reuse the shared where-clause`).toContain(
        "activeDevPlacementWhere(workspaceId, clientIds)",
      );
      expect(head, `${caller} should not hand-roll its own filters`).not.toContain("PRO_BONO");
    }
  });

  it("counts devs over the VISIBLE clients, so it agrees with the cards below it", () => {
    expect(SERVER_SRC).toMatch(/computeDistinctDevCount\([\s\S]{0,80}board\.cards\.map/);
  });

  it("opens the hidden list from the card rather than only counting it", () => {
    const board = BOARD.slice(BOARD.indexOf("export function ClientSummaryBoardView"));
    expect(board).toContain("setShowHidden");
    // Each hidden client must be restorable — a count with no way back is a dead end.
    expect(board).toMatch(/hiddenCards\.map\([\s\S]{0,400}hidden: false/);
  });
});
