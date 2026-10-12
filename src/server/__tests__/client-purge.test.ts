import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Permanent client delete (Portal → Deleted → Delete permanently).
 *
 * Two kinds of test:
 *  1. A SCHEMA GUARD. A permanent delete only works while nothing linked to a client blocks it.
 *     A table added later with a required relation to a client (or to anything that cascades from
 *     one) and no `onDelete: Cascade` would make purging fail for every client — silently, until
 *     someone tried. This walks the cascade tree and fails naming the offender.
 *  2. The purge rules: only an already-deleted client, only with the name typed back, and the one
 *     known blocker (another wiki linking to this client) removed in the same transaction.
 */

// Relations we have deliberately handled in purgeClientRecord rather than cascaded in the schema.
const HANDLED_IN_CODE = new Set(["ClientWikiLink.linkedClient -> WorkspaceClient"]);

describe("schema: nothing blocks a permanent client delete", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const models = new Map<string, string>();
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) models.set(m[1], m[2]);

  function refsTo(target: string) {
    const out: Array<{ model: string; field: string; action: string }> = [];
    for (const [model, body] of models) {
      for (const line of body.split("\n")) {
        const m = line.match(/^\s*(\w+)\s+(\w+)(\??)\s+@relation\(([^)]*)\)/);
        if (!m || m[2] !== target || !m[4].includes("fields:")) continue;
        const on = m[4].match(/onDelete:\s*(\w+)/);
        // Prisma's defaults: optional → SetNull, required → Restrict.
        out.push({ model, field: m[1], action: on ? on[1] : m[3] ? "SetNull" : "Restrict" });
      }
    }
    return out;
  }

  it("cascades or unlinks every relation in the delete tree", () => {
    const seen = new Set<string>();
    const queue = ["WorkspaceClient"];
    const blockers: string[] = [];
    while (queue.length) {
      const target = queue.pop()!;
      if (seen.has(target)) continue;
      seen.add(target);
      for (const r of refsTo(target)) {
        if (r.action === "Cascade") queue.push(r.model);
        else if (r.action === "Restrict" || r.action === "NoAction") {
          const key = `${r.model}.${r.field} -> ${target}`;
          if (!HANDLED_IN_CODE.has(key)) blockers.push(key);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(10); // the walk actually found the tree
    expect(blockers).toEqual([]);
  });
});

// ── purge rules ─────────────────────────────────────────────────────────────

const findFirst = vi.fn();
const transaction = vi.fn();
const wikiLinkDeleteMany = vi.fn((args: unknown) => ({ op: "wikiLinks", args }));
const clientDelete = vi.fn((args: unknown) => ({ op: "client", args }));
const audit = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceClient: { findFirst, delete: clientDelete },
    clientWikiLink: { deleteMany: wikiLinkDeleteMany },
    $transaction: transaction,
  },
}));
vi.mock("@/server/bootstrap", () => ({ ensureBaseRecords: async () => ({ workspace: { id: "ws1" } }) }));
vi.mock("@/server/audit-log", () => ({ recordAuditEntry: audit }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

describe("purgeClientRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only purges a client that is already deleted", async () => {
    const { purgeClientRecord } = await import("@/server/clients");
    findFirst.mockResolvedValueOnce(null);
    expect(await purgeClientRecord("acme", "Acme")).toBe("not_found");
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hidden: true }) }));
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses when the typed name doesn't match", async () => {
    const { purgeClientRecord } = await import("@/server/clients");
    findFirst.mockResolvedValueOnce({ id: "c1", name: "Acme Ltd" });
    expect(await purgeClientRecord("acme-ltd", "Acme")).toBe("name_mismatch");
    expect(transaction).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("removes the blocking wiki links and the client in ONE transaction, then audits", async () => {
    const { purgeClientRecord } = await import("@/server/clients");
    findFirst.mockResolvedValueOnce({ id: "c1", name: "Acme Ltd" });
    transaction.mockResolvedValueOnce([]);
    expect(await purgeClientRecord("acme-ltd", "  acme ltd ")).toBe("purged");
    expect(transaction).toHaveBeenCalledTimes(1);
    const ops = transaction.mock.calls[0][0] as Array<{ op: string; args: unknown }>;
    expect(ops.map((o) => o.op)).toEqual(["wikiLinks", "client"]);
    expect(ops[0].args).toEqual({ where: { linkedClientId: "c1" } });
    expect(ops[1].args).toEqual({ where: { id: "c1" } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "foundry.client.purged", target: "client:c1" }));
  });

  it("does not audit a purge that failed", async () => {
    const { purgeClientRecord } = await import("@/server/clients");
    findFirst.mockResolvedValueOnce({ id: "c1", name: "Acme" });
    transaction.mockRejectedValueOnce(new Error("FK violation"));
    await expect(purgeClientRecord("acme", "Acme")).rejects.toThrow("FK violation");
    expect(audit).not.toHaveBeenCalled();
  });
});
