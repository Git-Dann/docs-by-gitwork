/**
 * Authorisation contract for PATCH /api/documents/[id].
 *
 * This handler used to carry its own near-verbatim copy of `updateDocument`'s transaction, and in
 * copying the body it dropped every guard the canonical write path applies. The route is the
 * generic, type-agnostic document writer — it serves the iOS editor and any non-PROPOSAL type —
 * so the copy WITHOUT the guards is the one most clients call.
 *
 * What was reachable with nothing but a document id:
 *   · no `canManageDocs` — any signed-in member could edit any document;
 *   · no doc-type gate — a developer scoped away from admin types could edit an MSA/NDA and read
 *     it back in full from the response;
 *   · no cost write-protection — a user without `docs.viewCosts` reads costs blanked, so saving
 *     wrote their blanks over the real costing;
 *   · no ACCEPTED/DECLINED guard — an autosave could downgrade a client's own accept back to
 *     DRAFT, destroying the conversion signal the public page recorded.
 *
 * These tests drive the REAL route handler against the REAL `updateDocument`, `assertCan` and
 * `allowedDocTypesForUser`; only the identity resolver and Prisma are faked. That is deliberate:
 * asserting the route "calls updateDocument" would pass even if the delegation were wired wrong,
 * whereas checking the observable outcome cannot.
 *
 * `@/auth` is mocked because next-auth's ESM entrypoints don't resolve in the Node test
 * environment — the same constraint that pushed the module gate into its own pure file (§33).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectiveUser } from "@/server/auth/effective-user";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

const findFirst = vi.fn();
const update = vi.fn();
const deleteMany = vi.fn(async () => ({ count: 0 }));
const createMany = vi.fn(async () => ({ count: 0 }));

vi.mock("@/lib/prisma", () => {
  const child = { deleteMany, createMany };
  const tx = {
    document: { update },
    documentSection: child,
    costLineItem: child,
    timelinePhase: child,
    link: child,
    cTA: child,
    asset: child,
  };
  return {
    prisma: {
      document: { findFirst, update },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

const getEffectiveUserOrNull = vi.fn();

vi.mock("@/server/auth/effective-user", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth/effective-user")>();
  return { ...original, getEffectiveUserOrNull };
});

const WORKSPACE = "ws-gitwork";

/** `docs.manage` + `docs.viewAdminTypes` — PROPOSAL is an ADMIN doc type, so a developer holding
 *  only `docs.manage` is correctly 404'd on one. Editing needs both. */
const EDITOR = ["docs.manage", "docs.viewAdminTypes"];

function member(overrides: Partial<EffectiveUser> = {}): EffectiveUser {
  return {
    id: "user-1",
    email: "dev@gitwork.co.uk",
    name: "Dev",
    avatarUrl: null,
    role: "DEVELOPER",
    permissions: [],
    workspaceId: WORKSPACE,
    membershipId: "mem-1",
    ...overrides,
  };
}

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    workspaceId: WORKSPACE,
    ownerId: "user-9",
    templateId: null,
    documentType: "PROPOSAL",
    documentNumber: "PROP-2026-001",
    status: "DRAFT",
    title: "Acme rebuild",
    productName: "Foundry",
    clientName: "Acme",
    clientId: null,
    client: null,
    summary: "",
    version: "v1.0",
    shareToken: null,
    isShared: false,
    labels: [],
    parentId: null,
    isFavorite: false,
    expiresAt: null,
    metadata: { owner: "Someone" },
    deckDoc: null,
    exportSettings: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    sections: [],
    costLineItems: [],
    timelinePhases: [],
    assets: [],
    links: [],
    ctas: [],
    ...overrides,
  };
}

async function callPatch(id: string, body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/documents/[id]/route");
  const request = new Request("http://localhost/api/documents/doc-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(request as never, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({});
  deleteMany.mockResolvedValue({ count: 0 });
  createMany.mockResolvedValue({ count: 0 });
});

describe("PATCH /api/documents/[id] — authorisation", () => {
  it("refuses a member without `docs.manage`", async () => {
    // A DEVELOPER with no permissions is the ordinary case, and it used to succeed.
    getEffectiveUserOrNull.mockResolvedValue(member());
    findFirst.mockResolvedValue(documentRow());

    const response = await callPatch("doc-1", { title: "Renamed" });

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("allows a member who holds `docs.manage`", async () => {
    getEffectiveUserOrNull.mockResolvedValue(member({ permissions: EDITOR }));
    findFirst.mockResolvedValue(documentRow());

    const response = await callPatch("doc-1", { title: "Renamed" });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });

  it("404s a doc type the caller may not open, rather than 403", async () => {
    // 404 not 403 so a developer can't discover that an admin-only document exists. `docs.manage`
    // WITHOUT `docs.viewAdminTypes` is exactly the escalation this gate blocks.
    getEffectiveUserOrNull.mockResolvedValue(member({ permissions: ["docs.manage"] }));
    findFirst.mockResolvedValue(documentRow({ documentType: "MSA" }));

    const response = await callPatch("doc-1", { title: "Renamed" });

    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps working for an identity-less API-key caller", async () => {
    // `assertCan(null, …)` is a deliberate no-op for trusted server integrations. Breaking this
    // would break unattended callers, so it is asserted rather than assumed.
    getEffectiveUserOrNull.mockResolvedValue(null);
    findFirst.mockResolvedValue(documentRow());

    const response = await callPatch("doc-1", { title: "Renamed" });

    expect(response.status).toBe(200);
  });

  it("locks a SENT document against content edits", async () => {
    getEffectiveUserOrNull.mockResolvedValue(member({ permissions: EDITOR }));
    findFirst.mockResolvedValue(documentRow({ status: "SENT" }));

    const response = await callPatch("doc-1", { title: "Renamed" });

    expect(response.status).toBe(423);
  });

  it("does not let an autosave downgrade an ACCEPTED document back to DRAFT", async () => {
    // The client's accept/decline is a conversion signal recorded from the public page. An
    // editor autosave carrying a stale status must never overwrite it.
    getEffectiveUserOrNull.mockResolvedValue(member({ permissions: EDITOR }));
    findFirst.mockResolvedValue(documentRow({ status: "ACCEPTED" }));

    const response = await callPatch("doc-1", { status: "DRAFT" });

    expect(response.status).toBe(200);
    expect(update.mock.calls[0]?.[0]?.data?.status).toBe("ACCEPTED");
  });

  it("still allows an explicit archive out of a terminal state", async () => {
    getEffectiveUserOrNull.mockResolvedValue(member({ permissions: EDITOR }));
    findFirst.mockResolvedValue(documentRow({ status: "ACCEPTED" }));

    await callPatch("doc-1", { status: "ARCHIVED" });

    expect(update.mock.calls[0]?.[0]?.data?.status).toBe("ARCHIVED");
  });

  it("404s a document that does not exist", async () => {
    getEffectiveUserOrNull.mockResolvedValue(member({ permissions: EDITOR }));
    findFirst.mockResolvedValue(null);

    expect((await callPatch("nope", { title: "x" })).status).toBe(404);
  });
});
