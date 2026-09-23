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
  it("renders the editor before the derived figures", () => {
    const body = BOARD.slice(BOARD.indexOf("function Card("));
    const note = body.indexOf("<NoteEditor");
    const figures = body.indexOf("<Figure");
    expect(note, "the card should render a NoteEditor").toBeGreaterThan(-1);
    expect(figures, "the card should render figures").toBeGreaterThan(-1);
    expect(note).toBeLessThan(figures);
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
