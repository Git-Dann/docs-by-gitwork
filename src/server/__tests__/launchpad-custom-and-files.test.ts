/**
 * Per-client requirements + requirement files, through the REAL server functions
 * (`src/server/launchpad.ts`) against an in-memory Prisma, and the REAL routes.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LaunchpadStructure } from "@/types/launchpad";

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  wiki: { id: "w1", launchpadEnabled: true },
  kit: null as null | Row,
  items: [] as Row[],
  files: [] as Row[],
  templateStructure: null as unknown,
  calls: [] as string[],
}));

function kitView() {
  if (!db.kit) return null;
  return {
    ...db.kit,
    items: db.items,
    docs: [],
    // Metadata only — mirrors `fileMetaSelect`, so a test would notice bytes leaking.
    files: db.files.map((f) => {
      const meta = { ...f };
      delete meta.bytes;
      return meta;
    }),
    template: null,
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWiki: {
      findUnique: vi.fn(async (args: { where: { id?: string; clientId?: string } }) => {
        if (args.where.clientId) return { id: db.wiki.id };
        return { launchpadEnabled: db.wiki.launchpadEnabled, launchpad: kitView() };
      }),
      upsert: vi.fn(async () => ({ id: db.wiki.id })),
    },
    clientLaunchpad: {
      findUnique: vi.fn(async () => (db.kit ? { structureSnapshot: db.kit.structureSnapshot } : null)),
      update: vi.fn(async (args: { where: { id: string }; data: Row }) => {
        db.calls.push(`clientLaunchpad.update:${args.where.id}`);
        Object.assign(db.kit!, args.data, { updatedAt: new Date() });
        return db.kit;
      }),
      upsert: vi.fn(async (args: { create: Row; update: Row }) => {
        db.calls.push("clientLaunchpad.upsert");
        if (db.kit) Object.assign(db.kit, args.update);
        else db.kit = { id: "k1", enabledModules: [], answers: {}, updatedAt: new Date(), ...args.create };
        return db.kit;
      }),
    },
    launchpadItem: {
      upsert: vi.fn(async (args: { where: { kitId_itemId: { itemId: string } }; create: Row; update: Row }) => {
        const itemId = args.where.kitId_itemId.itemId;
        const existing = db.items.find((i) => i.itemId === itemId);
        if (existing) Object.assign(existing, args.update, { updatedAt: new Date() });
        else db.items.push({ ...args.create, updatedAt: new Date() });
      }),
      delete: vi.fn(async () => {
        db.calls.push("launchpadItem.delete");
      }),
      deleteMany: vi.fn(async () => {
        db.calls.push("launchpadItem.deleteMany");
      }),
    },
    launchpadItemFile: {
      create: vi.fn(async (args: { data: Row }) => {
        const row = { id: `f${db.files.length + 1}`, createdAt: new Date(), ...args.data };
        db.files.push(row);
        return { id: row.id };
      }),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        db.files = db.files.filter((f) => f.id !== args.where.id);
      }),
      findFirst: vi.fn(async (args: { where: { id: string; itemId: string } }) =>
        db.files.find((f) => f.id === args.where.id && f.itemId === args.where.itemId) ?? null,
      ),
    },
    launchpadTemplate: new Proxy(
      {},
      {
        get: () => () => {
          db.calls.push("launchpadTemplate.*");
          throw new Error("A per-client edit must never touch the template table");
        },
      },
    ),
  },
}));

vi.mock("@/server/bootstrap", () => ({
  ensureBaseRecords: vi.fn(async () => ({ workspace: { id: "ws1" } })),
}));

vi.mock("@/server/launchpad-templates", async () => {
  const { isLaunchpadStructure } = await import("@/lib/launchpad/structure");
  const { getDefaultLaunchpadStructure } = await import("@/lib/launchpad/default-template");
  return {
    resolveAssignableTemplate: vi.fn(async () => ({
      id: "t2",
      name: "Second",
      structure: db.templateStructure,
    })),
    normalizeStructure: (v: unknown) => (isLaunchpadStructure(v) ? v : getDefaultLaunchpadStructure()),
  };
});

// Not `importOriginal` — the real module imports NextAuth, which can't load in node.
vi.mock("@/server/launchpad-access", () => {
  return {
    launchpadAccessError: () => ({ message: "denied", status: 401 }),
    resolveLaunchpadWriter: vi.fn(async () => ({
      ok: true,
      writer: { wikiId: "w1", clientSlug: "acme", actorName: "Priya", actorEmail: "p@acme.test" },
    })),
    assertLaunchpadUploadRate: vi.fn(async () => {}),
    assertLaunchpadWriteRate: vi.fn(async () => {}),
  };
});

import { getDefaultLaunchpadStructure } from "@/lib/launchpad/default-template";
import {
  addLaunchpadCustomItem,
  assignLaunchpad,
  attachLaunchpadItemFile,
  deleteLaunchpadItemFile,
  removeLaunchpadCustomItem,
  updateLaunchpadCustomItem,
  updateLaunchpadItem,
} from "@/server/launchpad";
import { LAUNCHPAD_FILE_MAX_PER_ITEM } from "@/lib/launchpad/files";
import { POST as tokenUpload } from "@/app/api/wiki/[token]/launchpad/items/[itemId]/files/route";

const PDF = new TextEncoder().encode("%PDF-1.7\nhello");

function snapshot(): LaunchpadStructure {
  return db.kit!.structureSnapshot as LaunchpadStructure;
}
function ids(s: LaunchpadStructure) {
  return s.modules.flatMap((m) => m.fields.map((f) => f.id));
}

beforeEach(() => {
  db.wiki = { id: "w1", launchpadEnabled: true };
  db.kit = {
    id: "k1",
    wikiId: "w1",
    templateId: "t1",
    structureSnapshot: getDefaultLaunchpadStructure(),
    enabledModules: ["website"],
    answers: {},
    updatedAt: new Date(),
  };
  db.items = [];
  db.files = [];
  db.calls = [];
  db.templateStructure = getDefaultLaunchpadStructure();
});

describe("per-client requirements write into THIS kit's snapshot only", () => {
  it("adds a requirement to the kit snapshot and never touches the template", async () => {
    const dto = await addLaunchpadCustomItem("w1", "website", { label: "PI certificate" });
    const added = dto!.structure.modules
      .find((m) => m.id === "website")!
      .fields.find((f) => f.label === "PI certificate")!;
    expect(added.id.startsWith("custom-")).toBe(true);
    expect(added.custom).toBe(true);
    expect(ids(snapshot())).toContain(added.id);
    expect(db.calls).toEqual(["clientLaunchpad.update:k1"]);
    // It counts towards completeness like any other requirement.
    expect(dto!.completeness.outstanding).toContain("PI certificate");
  });

  it("edits a custom item but refuses a template item", async () => {
    const dto = await addLaunchpadCustomItem("w1", "website", { label: "A" });
    const id = ids(dto!.structure).find((i) => i.startsWith("custom-"))!;
    const edited = await updateLaunchpadCustomItem("w1", id, { label: "B" });
    expect(edited!.structure.modules.flatMap((m) => m.fields).find((f) => f.id === id)!.label).toBe("B");
    expect(await updateLaunchpadCustomItem("w1", "brand_assets", { label: "X" })).toBeNull();
    expect(await removeLaunchpadCustomItem("w1", "brand_assets")).toBeNull();
    expect(db.calls.every((c) => c === "clientLaunchpad.update:k1")).toBe(true);
  });

  it("removing keeps the item's row and files — stop reading, don't delete", async () => {
    const dto = await addLaunchpadCustomItem("w1", "website", { label: "A" });
    const id = ids(dto!.structure).find((i) => i.startsWith("custom-"))!;
    await attachLaunchpadItemFile("w1", id, { filename: "a.pdf", bytes: PDF }, { kind: "team", name: "Harry" });
    await removeLaunchpadCustomItem("w1", id);
    expect(ids(snapshot())).not.toContain(id);
    expect(db.items.some((i) => i.itemId === id)).toBe(true);
    expect(db.files.some((f) => f.itemId === id)).toBe(true);
    expect(db.calls).not.toContain("launchpadItem.delete");
  });

  it("re-assigning a template carries the client's custom items across", async () => {
    const dto = await addLaunchpadCustomItem("w1", "website", { label: "Carry me" });
    const id = ids(dto!.structure).find((i) => i.startsWith("custom-"))!;
    // The new template has no Website module at all.
    db.templateStructure = {
      modules: getDefaultLaunchpadStructure().modules.filter((m) => m.id !== "website"),
    };
    const reassigned = await assignLaunchpad("c1", { templateId: "t2" });
    expect(ids(reassigned!.structure)).toContain(id);
    expect(ids(snapshot())).toContain(id);
  });
});

describe("requirement files", () => {
  it("an upload marks the requirement provided, like a pasted link", async () => {
    const dto = await attachLaunchpadItemFile(
      "w1",
      "brand_assets",
      { filename: "logo.pdf", bytes: PDF },
      { kind: "client", name: "Priya" },
    );
    const item = dto!.items.find((i) => i.itemId === "brand_assets")!;
    expect(item.status).toBe("PROVIDED");
    expect(item.files).toHaveLength(1);
    expect(item.files![0]).toMatchObject({ filename: "logo.pdf", mime: "application/pdf", uploadedByKind: "client" });
    expect(item.files![0]).not.toHaveProperty("bytes");
  });

  it("deleting the last file reverts it to needed", async () => {
    await attachLaunchpadItemFile("w1", "brand_assets", { filename: "a.pdf", bytes: PDF }, { kind: "team", name: null });
    const dto = await deleteLaunchpadItemFile("w1", "brand_assets", "f1", { kind: "team", name: null });
    expect(dto!.items.find((i) => i.itemId === "brand_assets")!.status).toBe("NEEDED");
  });

  it("clearing the link does not revert an item that still has a file", async () => {
    await attachLaunchpadItemFile("w1", "brand_assets", { filename: "a.pdf", bytes: PDF }, { kind: "team", name: null });
    await updateLaunchpadItem("w1", "brand_assets", { link: "https://drive.test/x" }, null);
    const dto = await updateLaunchpadItem("w1", "brand_assets", { link: "" }, null);
    expect(dto!.items.find((i) => i.itemId === "brand_assets")!.status).toBe("PROVIDED");
  });

  it("rejects svg, html and oversize files with a 400, storing nothing", async () => {
    for (const [name, bytes] of [
      ["logo.svg", new TextEncoder().encode("<svg onload=alert(1)>")],
      ["page.html", new TextEncoder().encode("<html>")],
      ["logo.png", new TextEncoder().encode("<svg>")],
    ] as const) {
      await expect(
        attachLaunchpadItemFile("w1", "brand_assets", { filename: name, bytes }, { kind: "client", name: null }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(db.files).toHaveLength(0);
  });

  it(`refuses an ${LAUNCHPAD_FILE_MAX_PER_ITEM + 1}th file on one requirement`, async () => {
    for (let i = 0; i < LAUNCHPAD_FILE_MAX_PER_ITEM; i += 1) {
      await attachLaunchpadItemFile("w1", "brand_assets", { filename: `${i}.pdf`, bytes: PDF }, { kind: "team", name: null });
    }
    await expect(
      attachLaunchpadItemFile("w1", "brand_assets", { filename: "x.pdf", bytes: PDF }, { kind: "team", name: null }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses an item that isn't in this kit, and a switched-off section", async () => {
    expect(
      await attachLaunchpadItemFile("w1", "not_real", { filename: "a.pdf", bytes: PDF }, { kind: "client", name: null }),
    ).toBeNull();
    db.wiki.launchpadEnabled = false;
    expect(
      await attachLaunchpadItemFile("w1", "brand_assets", { filename: "a.pdf", bytes: PDF }, { kind: "client", name: null }),
    ).toBeNull();
  });
});

describe("the client-facing upload route", () => {
  function upload(name: string, body: BlobPart, type = "application/octet-stream") {
    const form = new FormData();
    form.append("file", new File([body], name, { type }));
    const req = new Request("http://test/api/wiki/tok/launchpad/items/brand_assets/files", {
      method: "POST",
      body: form,
    });
    return tokenUpload(req as never, { params: Promise.resolve({ token: "tok", itemId: "brand_assets" }) });
  }

  it("answers 400 (not 500) for an svg, even one claiming to be an image", async () => {
    const res = await upload("logo.svg", "<svg onload=alert(1)>", "image/svg+xml");
    expect(res.status).toBe(400);
    const res2 = await upload("logo.png", "<svg>", "image/png");
    expect(res2.status).toBe(400);
  });

  it("answers 400 for a file over 10 MB", async () => {
    const res = await upload("big.pdf", new Uint8Array(10 * 1024 * 1024 + 1));
    expect(res.status).toBe(400);
  });

  it("accepts a real PDF and marks the item provided", async () => {
    const res = await upload("contract.pdf", PDF, "application/pdf");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { launchpad: { items: Array<{ itemId: string; status: string }> } };
    expect(body.launchpad.items.find((i) => i.itemId === "brand_assets")!.status).toBe("PROVIDED");
  });
});

describe("the client cannot change WHAT is asked — only answer it", () => {
  const TOKEN_ROOT = join(process.cwd(), "src/app/api/wiki/[token]/launchpad");

  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
    });
  }

  it("there is no token route for custom items", () => {
    expect(existsSync(join(TOKEN_ROOT, "custom-items"))).toBe(false);
  });

  it("no token route imports a structure-editing function", () => {
    const files = routeFiles(TOKEN_ROOT);
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(
        /addLaunchpadCustomItem|updateLaunchpadCustomItem|removeLaunchpadCustomItem|assignLaunchpad|structureSnapshot/,
      );
    }
  });
});
