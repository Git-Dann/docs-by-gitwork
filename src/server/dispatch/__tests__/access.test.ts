/**
 * Dispatch answers as the person asking. These tests pin the rules (access.ts) and that the
 * orchestrator (respond.ts) actually applies them before any evidence is read or token spent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryFor, mayAskDispatch, subjectAllowed } from "../access";
import type { EffectiveUser } from "@/server/auth/effective-user";
import type { DispatchSubject } from "../types";

// ─── Mocks for the orchestrator ─────────────────────────────────────────────

const CLIENTS = [
  { id: "c-wedge", name: "Big Wedge Golf", slug: "big-wedge-golf" },
  { id: "c-acme", name: "Acme Health", slug: "acme-health" },
];

const workspaceClientFindMany = vi.fn(async (args: { where: { id?: { in: string[] } } }) =>
  args.where.id ? CLIENTS.filter((c) => args.where.id!.in.includes(c.id)) : CLIENTS,
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(async () => ({ id: "ws1", dispatchConfig: {}, aiProvider: "ANTHROPIC" })),
    },
    dispatchExchange: { count: vi.fn(async () => 0) },
    workspaceClient: { findMany: (args: { where: { id?: { in: string[] } } }) => workspaceClientFindMany(args) },
    workspaceMember: { findMany: vi.fn(async () => []) },
  },
}));

const assignedClientIds = vi.fn(async () => ["c-wedge"]);
vi.mock("@/server/tasks", () => ({ assignedClientIds: () => assignedClientIds() }));

const gatherEvidence = vi.fn(async (_args: unknown) => ({ stub: true }));
vi.mock("../evidence", () => ({ gatherEvidence: (args: unknown) => gatherEvidence(args) }));

vi.mock("../answer", () => ({
  runAnswer: vi.fn(async () => ({ answer: { headline: "ok", bullets: [], unverified: [] }, aiModel: "m", cached: false })),
}));

const { answerQuestion } = await import("../respond");

function user(role: string, permissions: string[]): EffectiveUser {
  return {
    id: "u1",
    email: "nasir@gitwork.co.uk",
    name: "Nasir",
    avatarUrl: null,
    role,
    permissions,
    workspaceId: "ws1",
    membershipId: "m1",
  } as EffectiveUser;
}

const DEVELOPER = user("DEVELOPER", ["clients"]);
const SUPER_ADMIN = user("SUPER_ADMIN", []);

function ask(question: string, asker: EffectiveUser | null, isExternalChannel = false) {
  return answerQuestion({ workspaceId: "ws1", question, channelId: "C1", asker, isExternalChannel });
}

beforeEach(() => {
  gatherEvidence.mockClear();
  workspaceClientFindMany.mockClear();
});

// ─── Pure rules ─────────────────────────────────────────────────────────────

describe("mayAskDispatch", () => {
  it("needs Portal, or Super Admin", () => {
    expect(mayAskDispatch({ role: "DEVELOPER", permissions: ["clients"] })).toBe(true);
    expect(mayAskDispatch({ role: "STAFF", permissions: ["backstage"] })).toBe(false);
    expect(mayAskDispatch({ role: "SUPER_ADMIN", permissions: [] })).toBe(true);
  });
});

describe("subjectAllowed", () => {
  const wedge: DispatchSubject = { kind: "client", id: "c-wedge", label: "Wedge", slug: "wedge" };
  const acme: DispatchSubject = { kind: "client", id: "c-acme", label: "Acme", slug: "acme" };
  const restricted = { seeAll: false, clientIds: new Set(["c-wedge"]) };

  it("lets a restricted asker ask only about their own clients", () => {
    expect(subjectAllowed(wedge, restricted)).toBe(true);
    expect(subjectAllowed(acme, restricted)).toBe(false);
  });

  it("refuses a person or workspace question to a restricted asker: both span every client", () => {
    expect(subjectAllowed({ kind: "person", id: "u2", label: "Priya", email: "p@x" }, restricted)).toBe(false);
    expect(subjectAllowed({ kind: "workspace", label: "Delivery" }, restricted)).toBe(false);
  });

  it("allows everything to someone who sees every client", () => {
    expect(subjectAllowed(acme, { seeAll: true, clientIds: new Set() })).toBe(true);
    expect(subjectAllowed({ kind: "workspace", label: "Delivery" }, { seeAll: true, clientIds: new Set() })).toBe(true);
  });
});

describe("deliveryFor", () => {
  const wedge: DispatchSubject = { kind: "client", id: "c-wedge", label: "Wedge", slug: "wedge" };

  it("answers in the thread in a DM", () => {
    expect(deliveryFor({ channelType: "im", channelId: "D1", subject: wedge, subjectInternalChannelIds: [] })).toBe(
      "thread",
    );
  });

  it("answers in the thread only in the client's own internal channel", () => {
    expect(
      deliveryFor({ channelType: "channel", channelId: "C-wedge", subject: wedge, subjectInternalChannelIds: ["C-wedge", null] }),
    ).toBe("thread");
    expect(
      deliveryFor({ channelType: "channel", channelId: "C-legacy", subject: wedge, subjectInternalChannelIds: [null, "C-legacy"] }),
    ).toBe("thread");
  });

  it("goes by DM in any other channel", () => {
    expect(
      deliveryFor({ channelType: "channel", channelId: "C-general", subject: wedge, subjectInternalChannelIds: ["C-wedge"] }),
    ).toBe("dm");
    expect(
      deliveryFor({ channelType: "group", channelId: "C-general", subject: wedge, subjectInternalChannelIds: [null, ""] }),
    ).toBe("dm");
  });

  it("sends a person or workspace answer by DM outside a DM", () => {
    const person: DispatchSubject = { kind: "person", id: "u2", label: "Priya", email: "p@x" };
    expect(deliveryFor({ channelType: "channel", channelId: "C1", subject: person, subjectInternalChannelIds: [] })).toBe("dm");
  });
});

// ─── The orchestrator applies them ──────────────────────────────────────────

describe("answerQuestion answers as the asker", () => {
  it("refuses someone it couldn't match to a Foundry account", async () => {
    const result = await ask("where are we with Big Wedge Golf?", null);
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/Foundry account/);
    expect(gatherEvidence).not.toHaveBeenCalled();
  });

  it("never answers in a Slack Connect channel, even for a Super Admin", async () => {
    const result = await ask("where are we with Big Wedge Golf?", SUPER_ADMIN, true);
    expect(result.status).toBe("error");
    expect(gatherEvidence).not.toHaveBeenCalled();
  });

  it("refuses someone without Portal", async () => {
    const result = await ask("where are we with Big Wedge Golf?", user("STAFF", ["backstage"]));
    expect(result.status).toBe("error");
    expect(gatherEvidence).not.toHaveBeenCalled();
  });

  it("doesn't even match a client the asker can't open, so it can't confirm it exists", async () => {
    const result = await ask("where are we with Acme Health?", DEVELOPER);
    expect(result.status).toBe("no_subject");
    expect(result.message).toMatch(/couldn't tell which client/);
    expect(gatherEvidence).not.toHaveBeenCalled();
    expect(workspaceClientFindMany.mock.calls[0][0].where.id).toEqual({ in: ["c-wedge"] });
  });

  it("refuses a restricted asker a question across every client", async () => {
    const result = await ask("is anything at risk across clients?", DEVELOPER);
    expect(result.status).toBe("no_subject");
    expect(result.message).toMatch(/clients you work on/);
    expect(gatherEvidence).not.toHaveBeenCalled();
  });

  it("answers about the asker's own client, without proposals or contracts for a developer", async () => {
    const result = await ask("where are we with Big Wedge Golf?", DEVELOPER);
    expect(result.status).toBe("answered");
    const args = gatherEvidence.mock.calls[0][0] as unknown as { documentTypes: string[] };
    expect(args.documentTypes).not.toContain("PROPOSAL");
  });

  it("answers a Super Admin about any client", async () => {
    const result = await ask("where are we with Acme Health?", SUPER_ADMIN);
    expect(result.status).toBe("answered");
  });
});
