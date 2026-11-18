/**
 * Copy the screenshots on a client's planning items (their Forge feed) onto the matching cards as
 * task attachments. Rules: src/lib/forge-import/images.ts.
 *
 * Runs after the import's transaction, never inside it: a download has no business holding a
 * database lock (§125). Bounded: IMAGE_CONCURRENCY downloads at once, IMAGE_BUDGET_MS in all,
 * 20 seconds and MAX_IMAGE_BYTES per image, every fetch through the SSRF guard. An image that
 * can't be copied is reported and left for the next run; it never fails the import.
 *
 * Each write is its own short transaction under a per-card lock that re-reads what the card has
 * already copied, so two runs at once can't attach the same image twice.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bytesForPrisma } from "@/lib/prisma-bytes";
import type { ForgeFeed } from "@/lib/forge-import/feed";
import {
  IMAGE_BUDGET_MS,
  IMAGE_CONCURRENCY,
  MAX_IMAGE_BYTES,
  acceptableContentType,
  copiedImages,
  imageFilename,
  imageJobs,
  sniffImage,
  type ImageJob,
  type ImageMime,
} from "@/lib/forge-import/images";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";

const THUMB_SIZE = 320;

export interface ImageCopyResult {
  copied: number;
  /** Images that couldn't be copied this time, and why. The next run tries again. */
  failed: Array<{ forgeId: string; url: string; reason: string }>;
  /** Images not tried because the time ran out. */
  deferred: number;
}

export type ImageFetcher = (url: string) => Promise<{ bytes: Uint8Array; mime: ImageMime }>;

class ImageRefused extends Error {}

async function readCappedBytes(res: Response): Promise<Uint8Array> {
  const length = Number(res.headers.get("content-length") ?? "0");
  if (length > MAX_IMAGE_BYTES) throw new ImageRefused("it's over 10 MB");
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ImageRefused("it's over 10 MB");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Download one image through the SSRF guard and check it really is one we accept. */
export const fetchForgeImage: ImageFetcher = async (url) => {
  let res: Response;
  try {
    res = await fetchScannableUrl(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new ImageRefused(`it couldn't be reached (${err instanceof Error ? err.message : "no answer"})`);
  }
  if (!res.ok) throw new ImageRefused(`the site answered ${res.status}`);
  if (!acceptableContentType(res.headers.get("content-type"))) {
    await res.body?.cancel().catch(() => undefined);
    throw new ImageRefused(`it isn't a PNG, JPEG, GIF or WebP image (${res.headers.get("content-type") ?? "no type"})`);
  }
  const bytes = await readCappedBytes(res);
  const mime = sniffImage(bytes);
  if (!mime) throw new ImageRefused("its contents aren't a PNG, JPEG, GIF or WebP image");
  return { bytes, mime };
};

/** Attach one downloaded image, unless the card already has it. Returns false if it was already there. */
async function attachOnce(job: ImageJob, bytes: Uint8Array, mime: ImageMime, thumb: Buffer): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`forge-img:${job.taskId}`}))`;
    const task = await tx.task.findUnique({ where: { id: job.taskId }, select: { metadata: true } });
    if (!task || copiedImages(task.metadata)[job.url]) return false;
    const row = await tx.taskAttachment.create({
      data: {
        taskId: job.taskId,
        uploadedById: null,
        image: bytesForPrisma(bytes),
        thumb: bytesForPrisma(thumb),
        mime,
        filename: imageFilename(job.url),
      },
      select: { id: true },
    });
    const meta =
      task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata) ? (task.metadata as Prisma.JsonObject) : {};
    const forge = meta.forge && typeof meta.forge === "object" && !Array.isArray(meta.forge) ? (meta.forge as Prisma.JsonObject) : {};
    await tx.task.update({
      where: { id: job.taskId },
      data: { metadata: { ...meta, forge: { ...forge, images: { ...copiedImages(task.metadata), [job.url]: row.id } } } },
    });
    return true;
  });
}

export async function copyForgeImages(input: {
  workspaceId: string;
  clientId: string;
  feed: Pick<ForgeFeed, "items">;
  fetchImage?: ImageFetcher;
  budgetMs?: number;
  now?: () => number;
}): Promise<ImageCopyResult> {
  const fetchImage = input.fetchImage ?? fetchForgeImage;
  const now = input.now ?? (() => Date.now());
  const budget = input.budgetMs ?? IMAGE_BUDGET_MS;
  const started = now();
  const cards = await prisma.task.findMany({
    where: { workspaceId: input.workspaceId, clientId: input.clientId, externalRef: { startsWith: "forge:" } },
    select: { id: true, externalRef: true, metadata: true },
  });
  const jobs = imageJobs(input.feed, cards);
  const result: ImageCopyResult = { copied: 0, failed: [], deferred: 0 };
  const sharp = jobs.length ? (await import("sharp")).default : null;

  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      if (now() - started > budget) {
        result.deferred++;
        continue;
      }
      try {
        const { bytes, mime } = await fetchImage(job.url);
        const thumb = await sharp!(Buffer.from(bytes))
          .rotate()
          .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside" })
          .jpeg({ quality: 80 })
          .toBuffer();
        if (await attachOnce(job, bytes, mime, thumb)) result.copied++;
      } catch (err) {
        const reason =
          err instanceof ImageRefused ? err.message : `it couldn't be saved (${err instanceof Error ? err.message : "unknown error"})`;
        result.failed.push({ forgeId: job.forgeId, url: job.url, reason });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, jobs.length) }, worker));
  return result;
}
