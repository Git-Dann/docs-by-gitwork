/**
 * Copying a client's planning screenshots onto their cards: idempotent, a failure is reported and
 * never thrown, and the time budget stops new downloads rather than running on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

type Task = { id: string; externalRef: string | null; metadata: unknown };
const db = vi.hoisted(() => ({ tasks: [] as Task[], attachments: [] as Array<{ id: string; taskId: string; filename: string | null }> }));

vi.mock("@/lib/prisma", () => {
  const tx = {
    // The lock is taken with $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw cannot read.
    $executeRaw: async () => 1,
    task: {
      findUnique: async ({ where }: { where: { id: string } }) => db.tasks.find((t) => t.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { metadata: unknown } }) => {
        const t = db.tasks.find((x) => x.id === where.id)!;
        t.metadata = data.metadata;
        return t;
      },
    },
    taskAttachment: {
      create: async ({ data }: { data: { taskId: string; filename: string | null } }) => {
        const row = { id: `att${db.attachments.length + 1}`, taskId: data.taskId, filename: data.filename };
        db.attachments.push(row);
        return { id: row.id };
      },
    },
  };
  return {
    prisma: {
      task: { findMany: async () => db.tasks.map((t) => ({ ...t })) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { copyForgeImages } from "../forge-images";

let png: Uint8Array;
beforeEach(async () => {
  db.tasks = [{ id: "t1", externalRef: "forge:348", metadata: { forge: { id: "348" } } }];
  db.attachments = [];
  png ??= new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).png().toBuffer());
});

const feed = { items: [{ id: "348", images: ["https://ops.example.com/a.png", "https://ops.example.com/b.png"] }] } as never;

describe("copying screenshots onto cards", () => {
  it("attaches each image and records it, so a second run copies nothing", async () => {
    const fetchImage = vi.fn(async () => ({ bytes: png, mime: "image/png" as const }));
    const first = await copyForgeImages({ workspaceId: "w", clientId: "c", feed, fetchImage });
    expect(first).toMatchObject({ copied: 2, failed: [], deferred: 0 });
    expect(db.attachments.map((a) => a.filename).sort()).toEqual(["a.png", "b.png"]);
    const second = await copyForgeImages({ workspaceId: "w", clientId: "c", feed, fetchImage });
    expect(second.copied).toBe(0);
    expect(fetchImage).toHaveBeenCalledTimes(2);
    expect(db.attachments).toHaveLength(2);
    // The card's own Forge record is kept alongside the image map.
    expect((db.tasks[0].metadata as { forge: { id: string } }).forge.id).toBe("348");
  });

  it("reports an image it couldn't copy and carries on with the rest", async () => {
    const fetchImage = vi.fn(async (url: string) => {
      if (url.endsWith("a.png")) throw new Error("boom");
      return { bytes: png, mime: "image/png" as const };
    });
    const result = await copyForgeImages({ workspaceId: "w", clientId: "c", feed, fetchImage });
    expect(result.copied).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ forgeId: "348", url: "https://ops.example.com/a.png" });
  });

  it("stops starting downloads once the time is up, leaving them for the next run", async () => {
    let t = 0;
    const fetchImage = vi.fn(async () => ({ bytes: png, mime: "image/png" as const }));
    const result = await copyForgeImages({ workspaceId: "w", clientId: "c", feed, fetchImage, budgetMs: 5, now: () => (t += 10) });
    expect(result.copied).toBe(0);
    expect(result.deferred).toBe(2);
    expect(fetchImage).not.toHaveBeenCalled();
  });
});
