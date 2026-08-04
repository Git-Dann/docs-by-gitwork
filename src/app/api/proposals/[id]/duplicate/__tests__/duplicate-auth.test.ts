/**
 * Authorisation contract for POST /api/proposals/[id]/duplicate.
 *
 * A duplicate mints a NEW Document the caller then owns and can read in full — sections,
 * costing, parties and signature blocks and all. So it has to be gated like a create, not
 * like a read. This route previously looked the source up with `findFirst({ where: { id } })`
 * and asserted nothing, so a bare id was enough to clone:
 *
 *   - a document belonging to another workspace (cross-tenant read via the clone), and
 *   - a document type the caller's role may not create (laundering the type gate that
 *     `POST /api/proposals` enforces into a copy they own).
 *
 * These tests drive the real route handler with the real `assertCan` / `allowedDocTypesForUser`
 * from `effective-user`; only the identity resolver, Prisma and the number allocator are faked.
 * `@/auth` is mocked because next-auth's ESM entrypoints don't resolve in the Node test
 * environment (the same constraint that pushed the module gate into its own pure file — §33).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectiveUser } from "@/server/auth/effective-user";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

const findFirst = vi.fn();
const create = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findFirst, create } },
}));

vi.mock("@/server/documents", () => ({
  allocateDocumentNumber: vi.fn(async () => "PROP-2026-999"),
}));

const getEffectiveUserOrNull = vi.fn();

vi.mock("@/server/auth/effective-user", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth/effective-user")>();
  return { ...original, getEffectiveUserOrNull };
});

const WORKSPACE = "ws-gitwork";
const OTHER_WORKSPACE = "ws-someone-else";

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

/** A document row shaped like `proposalInclude` so the real serializer can run on it. */
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
    metadata: { owner: "Someone Else" },
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

/**
 * Stand-in for Prisma's own `where` handling: return the row only when every scalar filter
 * matches. That's what makes `where: { id, workspaceId }` meaningful in these tests — an
 * out-of-workspace id resolves to null exactly as the database would return no row.
 */
function seed(rows: Array<ReturnType<typeof documentRow>>) {
  findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    return (
      rows.find((row) =>
        Object.entries(where).every(
          ([key, value]) => (row as Record<string, unknown>)[key] === value,
        ),
      ) ?? null
    );
  });
}

async function callDuplicate(id: string) {
  const { POST } = await import("@/app/api/proposals/[id]/duplicate/route");
  const request = new Request("http://localhost/api/proposals/doc/duplicate", {
    method: "POST",
  });
  return POST(request as never, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Prisma returns the created row with its relations resolved; the nested `{ create: [...] }`
  // writers in `data` are inputs, not row shape, so drop them and keep the scalars.
  create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const scalars = Object.fromEntries(
      Object.entries(data).filter(
        ([, value]) =>
          !(value !== null && typeof value === "object" && "create" in (value as object)),
      ),
    );
    return documentRow({ ...scalars, id: "doc-clone", client: null });
  });
});

describe("POST /api/proposals/[id]/duplicate — workspace scoping", () => {
  it("404s an out-of-workspace id instead of cloning it", async () => {
    seed([documentRow({ id: "theirs", workspaceId: OTHER_WORKSPACE })]);
    getEffectiveUserOrNull.mockResolvedValue(
      member({ role: "ADMIN", permissions: ["docs.manage", "docs.viewAdminTypes"] }),
    );

    const response = await callDuplicate("theirs");

    expect(response.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the caller's workspace", async () => {
    seed([documentRow({ id: "mine" })]);
    getEffectiveUserOrNull.mockResolvedValue(
      member({ role: "ADMIN", permissions: ["docs.manage", "docs.viewAdminTypes"] }),
    );

    await callDuplicate("mine");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "mine", workspaceId: WORKSPACE } }),
    );
  });

  it("leaves the lookup unscoped for an identity-less API-key caller", async () => {
    // No per-user identity → no workspace to scope to. Same position as POST /api/proposals,
    // which writes into the bootstrap workspace for exactly this case. Must not start 401ing
    // unattended integrations that work today.
    seed([documentRow({ id: "mine" })]);
    getEffectiveUserOrNull.mockResolvedValue(null);

    const response = await callDuplicate("mine");

    expect(response.status).toBe(201);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "mine" } }));
  });
});

describe("POST /api/proposals/[id]/duplicate — permission gate", () => {
  it("refuses a caller without docs.manage", async () => {
    seed([documentRow({ id: "mine" })]);
    getEffectiveUserOrNull.mockResolvedValue(member({ permissions: [] }));

    const response = await callDuplicate("mine");

    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
    // Gate first: a caller who may not create documents shouldn't even get a read.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("refuses a doc type the caller's role may not create", async () => {
    // A developer holds docs.manage but not docs.viewAdminTypes, so PROPOSAL is out of reach
    // on the create path — duplicate must not launder it into a copy they own.
    seed([documentRow({ id: "mine", documentType: "PROPOSAL" })]);
    getEffectiveUserOrNull.mockResolvedValue(member({ permissions: ["docs.manage"] }));

    const response = await callDuplicate("mine");

    // 404, not 403 — mirrors the GET/PATCH/favorite reads so the doc's existence isn't leaked.
    expect(response.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("lets that same developer duplicate a lightweight type they may create", async () => {
    seed([documentRow({ id: "mine", documentType: "HANDOVER" })]);
    getEffectiveUserOrNull.mockResolvedValue(member({ permissions: ["docs.manage"] }));

    const response = await callDuplicate("mine");

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("clones for a legitimate same-workspace caller with permission", async () => {
    seed([documentRow({ id: "mine" })]);
    getEffectiveUserOrNull.mockResolvedValue(
      member({ id: "user-7", name: "Dan", role: "ADMIN", permissions: ["docs.manage", "docs.viewAdminTypes"] }),
    );

    const response = await callDuplicate("mine");
    const payload = (await response.json()) as { proposal: { title: string } };

    expect(response.status).toBe(201);
    expect(payload.proposal.title).toBe("Acme rebuild (Copy)");
    // Clone lands in the caller's workspace and is attributed to them, as before.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: WORKSPACE, ownerId: "user-7" }),
      }),
    );
  });
});
