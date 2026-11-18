/** A card's dev tasks come from the server, archived ones included, scoped to the card's client. */
import { describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const card = vi.hoisted(() => ({ value: { id: "card", clientId: "c1", itemType: "feature" as string | null } as { id: string; clientId: string; itemType: string | null } | null }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceClient: { findFirst: async () => ({ id: "c1" }) },
    task: {
      findFirst: async () => card.value,
      findMany: async (args: Record<string, unknown>) => {
        queries.push(args);
        return [];
      },
    },
  },
}));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: vi.fn(async () => ({})) }));
vi.mock("@/server/client-assignments", () => ({ placementClientIds: vi.fn(async () => []) }));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/server/auth/effective-user", () => ({
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
  NotFoundError: class NotFoundError extends Error {
    status = 404;
  },
  canSeeAllClients: () => true,
}));

import { listCardLinks } from "../tasks";

const admin = { id: "u1", workspaceId: "w1", role: "SUPER_ADMIN", permissions: [] } as never;

describe("listCardLinks", () => {
  it("reads every linked task, archived included, and live unlinked dev tasks as candidates", async () => {
    queries.length = 0;
    await listCardLinks(admin, "card");
    const [linked, candidates] = queries;
    expect(linked.where).toEqual({ workspaceId: "w1", clientId: "c1", productCardId: "card" });
    expect(candidates.where).toMatchObject({ workspaceId: "w1", clientId: "c1", itemType: null, productCardId: null, archivedAt: null, parentId: null });
  });

  it("a task that isn't a card has no links and reads nothing more", async () => {
    queries.length = 0;
    card.value = { id: "t", clientId: "c1", itemType: null };
    expect(await listCardLinks(admin, "t")).toEqual({ linked: [], candidates: [] });
    expect(queries).toHaveLength(0);
  });

  it("answers 404, not 403, for an id that isn't a task in this workspace", async () => {
    card.value = null;
    await expect(listCardLinks(admin, "nope")).rejects.toMatchObject({ status: 404 });
    card.value = { id: "card", clientId: "c1", itemType: "feature" };
  });
});
