// @vitest-environment node
/** Curator runs are only acted on, or restored, inside the caller's own workspace. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { curatorRun: { findFirst: (a: unknown) => findFirst(a), update: vi.fn() }, starter: { updateMany: vi.fn() } },
}));
vi.mock("@/server/starters", () => ({ updateStarter: vi.fn() }));
vi.mock("@/server/check-config", () => ({ saveCheckConfig: vi.fn() }));

const { applyProposal, dismissProposal } = await import("../apply");
const { restoreCuratorRun } = await import("../restore");

beforeEach(() => findFirst.mockReset().mockResolvedValue(null));

describe("curator runs stay inside the caller's workspace", () => {
  it("looks the run up by id AND workspace", async () => {
    await applyProposal("ws-b", "run-a", "p1");
    await dismissProposal("ws-b", "run-a", "p1");
    await restoreCuratorRun("ws-b", "run-a");
    for (const [arg] of findFirst.mock.calls) {
      expect((arg as { where: unknown }).where).toEqual({ id: "run-a", workspaceId: "ws-b" });
    }
    expect(findFirst).toHaveBeenCalledTimes(3);
  });

  it("another workspace's run reads as not found", async () => {
    expect(await applyProposal("ws-b", "run-a", "p1")).toEqual({ ok: false, reason: "Run not found" });
    expect((await restoreCuratorRun("ws-b", "run-a")).ok).toBe(false);
  });
});
