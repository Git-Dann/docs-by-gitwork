/**
 * Care stays inside the caller's workspace (Phase 2.2b, Care): another business's Care client,
 * conversation or ticket id reads as a 404, and nothing is written.
 *
 * Prisma is mocked with two businesses' rows; the database-backed proof is tests/isolation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  clients: [
    { id: "care-a", workspaceId: "ws-a" },
    { id: "care-b", workspaceId: "ws-b" },
  ],
  conversations: [
    { id: "conv-a", clientId: "care-a" },
    { id: "conv-b", clientId: "care-b" },
  ],
  tickets: [
    { id: "ticket-a", clientId: "care-a" },
    { id: "ticket-b", clientId: "care-b" },
  ],
  caller: { workspaceId: "ws-a" } as { workspaceId: string } | null,
}));

type Where = Record<string, unknown>;
const matches = (row: Record<string, unknown>, where: Where) =>
  Object.entries(where).every(([k, v]) => row[k] === v);

const writes = vi.hoisted(() => ({
  updateConversation: vi.fn(async () => ({})),
  deleteTicket: vi.fn(async () => undefined),
  updateSupportClient: vi.fn(async () => ({})),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportClient: { count: vi.fn(async ({ where }: { where: Where }) => db.clients.filter((r) => matches(r, where)).length) },
    supportConversation: { count: vi.fn(async ({ where }: { where: Where }) => db.conversations.filter((r) => matches(r, where)).length) },
    supportTicket: { count: vi.fn(async ({ where }: { where: Where }) => db.tickets.filter((r) => matches(r, where)).length) },
    accountConnection: { count: vi.fn(async () => 0) },
    supportReport: { count: vi.fn(async () => 0) },
    draftSupportAction: { count: vi.fn(async () => 0) },
    supportWorkflowRule: { count: vi.fn(async () => 0) },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: vi.fn(async () => ({ workspace: { id: "ws-a" } })) }));

vi.mock("@/server/auth/effective-user", () => ({
  getEffectiveUserOrNull: vi.fn(async () => db.caller),
  requireAuthedUser: vi.fn(async () => db.caller),
  assertCan: vi.fn(),
  canManageSupport: vi.fn(() => true),
}));

vi.mock("@/server/support", () => ({
  getConversation: vi.fn(async (id: string) => ({ id })),
  updateConversation: writes.updateConversation,
  getTicket: vi.fn(async (id: string) => ({ id })),
  updateTicket: vi.fn(async () => ({})),
  deleteTicket: writes.deleteTicket,
  getSupportClient: vi.fn(async (id: string) => ({ id })),
  updateSupportClient: writes.updateSupportClient,
  deleteSupportClient: vi.fn(async () => undefined),
}));

const req = (method = "GET", body?: unknown) =>
  new Request("http://localhost/api/support/x", {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  }) as unknown as import("next/server").NextRequest;

beforeEach(() => {
  db.caller = { workspaceId: "ws-a" };
  writes.updateConversation.mockClear();
  writes.deleteTicket.mockClear();
  writes.updateSupportClient.mockClear();
});

describe("requireSupportClient / requireSupportRow", () => {
  it("accepts the caller's own client and refuses another workspace's with a 404", async () => {
    const { requireSupportClient } = await import("@/server/support-scope");
    await expect(requireSupportClient(req(), "care-a")).resolves.toBe("ws-a");
    await expect(requireSupportClient(req(), "care-b")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a row that belongs to another client, even when the client in the URL is yours", async () => {
    const { requireSupportRow } = await import("@/server/support-scope");
    await expect(requireSupportRow("conversation", "conv-a", "care-a")).resolves.toBeUndefined();
    await expect(requireSupportRow("conversation", "conv-b", "care-a")).rejects.toMatchObject({ status: 404 });
    await expect(requireSupportRow("ticket", "ticket-b", "care-a")).rejects.toMatchObject({ status: 404 });
  });
});

describe("Care routes refuse another workspace's ids", () => {
  it("GET a conversation: own one answers, another business's is a 404", async () => {
    const { GET } = await import("@/app/api/support/clients/[clientId]/conversations/[convId]/route");
    const own = await GET(req(), { params: Promise.resolve({ clientId: "care-a", convId: "conv-a" }) });
    expect(own.status).toBe(200);
    const theirs = await GET(req(), { params: Promise.resolve({ clientId: "care-b", convId: "conv-b" }) });
    expect(theirs.status).toBe(404);
    // Your client in the URL, their conversation id: still a 404.
    const mixed = await GET(req(), { params: Promise.resolve({ clientId: "care-a", convId: "conv-b" }) });
    expect(mixed.status).toBe(404);
  });

  it("PATCH another business's conversation writes nothing", async () => {
    const { PATCH } = await import("@/app/api/support/clients/[clientId]/conversations/[convId]/route");
    const res = await PATCH(req("PATCH", { status: "closed" }), {
      params: Promise.resolve({ clientId: "care-b", convId: "conv-b" }),
    });
    expect(res.status).toBe(404);
    expect(writes.updateConversation).not.toHaveBeenCalled();
  });

  it("DELETE another business's ticket writes nothing", async () => {
    const { DELETE } = await import("@/app/api/support/clients/[clientId]/tickets/[ticketId]/route");
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ clientId: "care-b", ticketId: "ticket-b" }) });
    expect(res.status).toBe(404);
    expect(writes.deleteTicket).not.toHaveBeenCalled();
  });

  it("PATCH another business's Care client writes nothing", async () => {
    const { PATCH } = await import("@/app/api/support/clients/[clientId]/route");
    const res = await PATCH(req("PATCH", { name: "x" }), { params: Promise.resolve({ clientId: "care-b" }) });
    expect(res.status).toBe(404);
    expect(writes.updateSupportClient).not.toHaveBeenCalled();
  });

  it("the second business is refused the first's rows too", async () => {
    db.caller = { workspaceId: "ws-b" };
    const { GET } = await import("@/app/api/support/clients/[clientId]/tickets/[ticketId]/route");
    const res = await GET(req(), { params: Promise.resolve({ clientId: "care-a", ticketId: "ticket-a" }) });
    expect(res.status).toBe(404);
  });
});
