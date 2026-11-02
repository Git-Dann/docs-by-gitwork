/**
 * Docs lookups carry the caller's workspace (multi-tenant Phase 2.2b). The database-backed proof
 * that another business's document reads as "not found" is tests/isolation; this pins the rule.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/bootstrap", () => ({
  ensureBaseRecords: vi.fn(async () => ({ workspace: { id: "gitwork-ws" } })),
}));

describe("docsWorkspaceId", () => {
  it("uses the caller's own workspace", async () => {
    const { docsWorkspaceId } = await import("@/server/documents-scope");
    expect(await docsWorkspaceId({ workspaceId: "canary-ws" })).toBe("canary-ws");
  });

  it("falls back to Gitwork's workspace for the workspace API key (no user), as before", async () => {
    const { docsWorkspaceId } = await import("@/server/documents-scope");
    expect(await docsWorkspaceId(null)).toBe("gitwork-ws");
  });
});

describe("templateVisibleWhere", () => {
  it("shows the workspace's own templates and Foundry's stock ones, nobody else's", async () => {
    const { templateVisibleWhere } = await import("@/server/documents-scope");
    expect(templateVisibleWhere("canary-ws")).toEqual({
      OR: [{ workspaceId: "canary-ws" }, { workspaceId: null }],
    });
  });
});
