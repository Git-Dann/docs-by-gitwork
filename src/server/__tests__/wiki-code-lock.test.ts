import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    wikiCodeModule: { findFirst: (...a: unknown[]) => findFirst(...a), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    wikiCodeVersion: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    wikiCodeVariant: { findFirst: vi.fn() },
    wikiCodeEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { CodeLockedError, createCodeVersion, lockCodeModule, unlockCodeModule } from "@/server/wiki-code";

const gitwork = { userId: "u1", name: "Dan Lindsay", isClient: false };
const client = { userId: "u2", name: "Priya Nair", isClient: true };
const files = [{ filename: "main.cpp", content: "x" }];

beforeEach(() => findFirst.mockReset());

describe("a locked module", () => {
  it("refuses a new version, naming who locked it", async () => {
    findFirst.mockResolvedValue({ id: "m1", name: "Receiver", lockedAt: new Date(), lockedByName: "Dan Lindsay" });
    const p = createCodeVersion("c1", "m1", { label: "v2", files }, client);
    await expect(p).rejects.toBeInstanceOf(CodeLockedError);
    await expect(p).rejects.toMatchObject({ status: 423, message: expect.stringContaining("Dan Lindsay") });
  });
});

describe("locking and unlocking", () => {
  it("only Gitwork can lock: a client account can't", async () => {
    await expect(lockCodeModule("c1", "m1", client)).rejects.toMatchObject({ status: 403 });
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("unlocking needs the words typed, before anything is read", async () => {
    await expect(unlockCodeModule("c1", "m1", "unlock", gitwork)).rejects.toMatchObject({ status: 400 });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
