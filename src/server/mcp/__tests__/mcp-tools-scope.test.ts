/**
 * MCP tools a developer can reach, run through the real handler against a mocked store.
 *
 * Pinned: list_members returns current members only and leaves out email unless the caller is an
 * Admin; list_documents and update_document only reach documents for the caller's own clients
 * (or their own client-less drafts), unless they can see every client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  memberWhere: null as unknown,
  docWhere: null as unknown,
  doc: null as null | { workspaceId: string; clientId: string | null; ownerId: string },
  updated: [] as string[],
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        store.memberWhere = args.where;
        return [
          { id: "m1", role: "ADMIN", user: { id: "u1", name: "Harry", email: "harry@gitwork.co.uk" } },
          { id: "m2", role: "DEVELOPER", user: { id: "u2", name: "Nasir", email: "nasir@gitwork.co.uk" } },
        ];
      }),
    },
    document: {
      findUnique: vi.fn(async () => store.doc),
      findMany: vi.fn(async (args: { where: unknown }) => {
        store.docWhere = args.where;
        return [];
      }),
    },
  },
}));

vi.mock("@/server/tasks", async (orig) => ({
  ...(await orig<typeof import("@/server/tasks")>()),
  assignedClientIds: vi.fn(async () => ["client-mine"]),
}));

vi.mock("@/server/documents", async (orig) => ({
  ...(await orig<typeof import("@/server/documents")>()),
  updateDocument: vi.fn(async (_u: unknown, id: string) => {
    store.updated.push(id);
    return { id, title: "Handover", documentNumber: "H-1", documentType: "HANDOVER", status: "DRAFT" };
  }),
}));

import { _testing } from "../handler";
import { documentInScope, documentScopeFor } from "../document-scope";
import type { EffectiveUser } from "@/server/auth/effective-user";

const developer = {
  id: "u2",
  role: "DEVELOPER",
  workspaceId: "w1",
  permissions: ["clients", "proposals", "docs.manage"],
} as unknown as EffectiveUser;
const admin = { ...developer, id: "u1", role: "ADMIN" } as unknown as EffectiveUser;
const superAdmin = { ...developer, id: "u0", role: "SUPER_ADMIN", permissions: [] } as unknown as EffectiveUser;

async function call(name: string, args: Record<string, unknown>, user: EffectiveUser) {
  const tool = _testing.TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(user, args);
}

beforeEach(() => {
  store.memberWhere = null;
  store.docWhere = null;
  store.doc = null;
  store.updated = [];
});

describe("list_members", () => {
  it("asks only for current members of the caller's workspace", async () => {
    await call("list_members", {}, developer);
    expect(store.memberWhere).toMatchObject({ workspaceId: "w1", archivedAt: null });
  });

  it("leaves out email for a developer", async () => {
    const res = await call("list_members", {}, developer);
    expect(res.content[0].text).not.toContain("@gitwork.co.uk");
    expect(res.content[0].text).toContain("Nasir");
  });

  it("includes email for an Admin", async () => {
    const res = await call("list_members", {}, admin);
    expect(res.content[0].text).toContain("nasir@gitwork.co.uk");
  });
});

describe("document scope rule", () => {
  const me = { id: "u2", workspaceId: "w1" };

  it("limits a scoped user to their clients and their own client-less drafts", () => {
    expect(documentScopeFor(me, false, ["c1"])).toEqual({
      workspaceId: "w1",
      OR: [{ clientId: { in: ["c1"] } }, { clientId: null, ownerId: "u2" }],
    });
  });

  it("matches nothing by client when they have no clients", () => {
    expect(documentScopeFor(me, false, [])).toMatchObject({
      OR: [{ clientId: { in: ["__none__"] } }, { clientId: null, ownerId: "u2" }],
    });
  });

  it("gives see-all users the whole workspace", () => {
    expect(documentScopeFor(me, true, [])).toEqual({ workspaceId: "w1" });
  });

  it("decides single documents the same way", () => {
    expect(documentInScope({ workspaceId: "w1", clientId: "c1", ownerId: "x" }, me, false, ["c1"])).toBe(true);
    expect(documentInScope({ workspaceId: "w1", clientId: "c2", ownerId: "u2" }, me, false, ["c1"])).toBe(false);
    expect(documentInScope({ workspaceId: "w1", clientId: null, ownerId: "u2" }, me, false, [])).toBe(true);
    expect(documentInScope({ workspaceId: "w1", clientId: null, ownerId: "x" }, me, false, [])).toBe(false);
    expect(documentInScope({ workspaceId: "w2", clientId: "c1", ownerId: "u2" }, me, true, [])).toBe(false);
  });
});

describe("list_documents", () => {
  it("applies the client scope when no client is given", async () => {
    await call("list_documents", {}, developer);
    expect(store.docWhere).toMatchObject({
      AND: [{ workspaceId: "w1", OR: [{ clientId: { in: ["client-mine"] } }, { clientId: null, ownerId: "u2" }] }],
    });
  });

  it("does not narrow a Super Admin", async () => {
    await call("list_documents", {}, superAdmin);
    expect(store.docWhere).toMatchObject({ AND: [{ workspaceId: "w1" }] });
  });
});

describe("update_document", () => {
  it("refuses another client's document as not found", async () => {
    store.doc = { workspaceId: "w1", clientId: "client-other", ownerId: "someone" };
    await expect(call("update_document", { documentId: "d1", title: "x" }, developer)).rejects.toThrow(
      "Document not found",
    );
    expect(store.updated).toEqual([]);
  });

  it("edits a document for one of their clients", async () => {
    store.doc = { workspaceId: "w1", clientId: "client-mine", ownerId: "someone" };
    const res = await call("update_document", { documentId: "d1", title: "x" }, developer);
    expect(res.isError).toBeUndefined();
    expect(store.updated).toEqual(["d1"]);
  });
});
