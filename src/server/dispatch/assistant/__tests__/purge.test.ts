import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMessages: vi.fn(),
  deleteActions: vi.fn(),
  deleteConversations: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dispatchConversation: { findMany: db.findMany, deleteMany: db.deleteConversations },
    dispatchMessage: { deleteMany: db.deleteMessages },
    dispatchAction: { deleteMany: db.deleteActions },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const { purgeOldDispatchChats, CHAT_RETENTION_DAYS } = await import("../purge");

describe("purgeOldDispatchChats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.deleteMessages.mockResolvedValue({ count: 7 });
    db.deleteActions.mockResolvedValue({ count: 1 });
    db.deleteConversations.mockResolvedValue({ count: 2 });
  });

  it("deletes chats unused for 90 days, their messages, and proposals never carried out", async () => {
    const now = new Date("2026-11-25T00:00:00Z");
    db.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    const out = await purgeOldDispatchChats(now);

    const cutoff = db.findMany.mock.calls[0][0].where.updatedAt.lt as Date;
    expect(CHAT_RETENTION_DAYS).toBe(90);
    expect(now.getTime() - cutoff.getTime()).toBe(90 * 86_400_000);
    expect(db.deleteMessages).toHaveBeenCalledWith({ where: { conversationId: { in: ["c1", "c2"] } } });
    // Carried-out proposals stay: the record of what Dispatch changed, and for whom.
    expect(db.deleteActions).toHaveBeenCalledWith({ where: { conversationId: { in: ["c1", "c2"] }, status: { not: "done" } } });
    expect(db.deleteConversations).toHaveBeenCalledWith({ where: { id: { in: ["c1", "c2"] } } });
    expect(out).toEqual({ chats: 2, messages: 7, actions: 1 });
  });

  it("does nothing when no chat is old enough", async () => {
    db.findMany.mockResolvedValue([]);
    expect(await purgeOldDispatchChats()).toEqual({ chats: 0, messages: 0, actions: 0 });
    expect(db.deleteMessages).not.toHaveBeenCalled();
  });
});
