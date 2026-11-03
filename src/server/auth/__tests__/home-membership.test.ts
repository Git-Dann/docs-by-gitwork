import { describe, expect, it } from "vitest";
import { chooseMembership } from "../home-membership";

const m = (workspaceId: string, slug: string, createdAt: string, archivedAt: string | null = null) => ({
  workspaceId, archivedAt, createdAt, workspace: { slug },
});

const gitwork = m("ws-g", "gitwork", "2026-01-01");
const canary = m("ws-c", "canary", "2025-06-01");
const later = m("ws-l", "later", "2026-09-01");

describe("chooseMembership", () => {
  it("keeps the workspace the token names while that membership is active", () => {
    expect(chooseMembership([gitwork, canary], "ws-c")?.workspaceId).toBe("ws-c");
  });

  it("falls back to Gitwork, so every Gitwork user keeps the workspace they had", () => {
    expect(chooseMembership([canary, gitwork])?.workspaceId).toBe("ws-g");
    expect(chooseMembership([canary, gitwork], "ws-unknown")?.workspaceId).toBe("ws-g");
  });

  it("otherwise takes the oldest active membership", () => {
    expect(chooseMembership([later, canary])?.workspaceId).toBe("ws-c");
  });

  it("never chooses an archived membership, even the one the token names", () => {
    const archivedCanary = m("ws-c", "canary", "2025-06-01", "2026-10-01");
    expect(chooseMembership([archivedCanary, later], "ws-c")?.workspaceId).toBe("ws-l");
    expect(chooseMembership([m("ws-g", "gitwork", "2026-01-01", "2026-10-01")])).toBeNull();
  });

  it("has no workspace for someone with no memberships", () => {
    expect(chooseMembership([])).toBeNull();
  });
});
