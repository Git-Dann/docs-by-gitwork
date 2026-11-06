import { beforeEach, describe, expect, it, vi } from "vitest";

const getEffectiveUserOrNull = vi.fn();
const ensureBaseRecords = vi.fn();

vi.mock("@/server/auth/effective-user", () => ({ getEffectiveUserOrNull }));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords }));

const { requestActor, workspaceIdForRequest } = await import("../scope");

const req = new Request("http://localhost/api/x");

beforeEach(() => {
  getEffectiveUserOrNull.mockReset();
  ensureBaseRecords.mockReset();
  ensureBaseRecords.mockResolvedValue({
    workspace: { id: "ws-gitwork" },
    user: { id: "u-owner", name: "Foundry Owner", email: "owner@gitwork.io" },
  });
});

describe("requestActor", () => {
  it("uses the caller's own workspace and name", async () => {
    getEffectiveUserOrNull.mockResolvedValue({ id: "u-ada", workspaceId: "ws-canary", name: "Ada", email: "ada@canary.test" });
    await expect(requestActor(req)).resolves.toEqual({
      workspace: { id: "ws-canary" },
      user: { id: "u-ada", name: "Ada", email: "ada@canary.test" },
    });
    expect(ensureBaseRecords).not.toHaveBeenCalled();
  });

  it("credits the workspace API key (no caller) to the Gitwork owner, as before", async () => {
    getEffectiveUserOrNull.mockResolvedValue(null);
    await expect(requestActor(req)).resolves.toEqual({
      workspace: { id: "ws-gitwork" },
      user: { id: "u-owner", name: "Foundry Owner", email: "owner@gitwork.io" },
    });
  });
});

describe("workspaceIdForRequest", () => {
  it("never answers Gitwork for a caller from another workspace", async () => {
    getEffectiveUserOrNull.mockResolvedValue({ workspaceId: "ws-canary", name: null, email: "x@canary.test" });
    await expect(workspaceIdForRequest(req)).resolves.toBe("ws-canary");
  });
});
