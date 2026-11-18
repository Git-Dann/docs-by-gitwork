/**
 * Copying the screenshots on a client's planning items into Foundry (CLAUDE.md §125). Pure rules;
 * the downloading and writing is src/server/forge-images.ts.
 *
 * Which images a card still needs: an item's http(s) images that the card hasn't copied yet. A
 * card records what it copied in metadata.forge.images (source URL → attachment id), so a re-run
 * never copies an image twice, and an image the team deleted from the card isn't copied back
 * (its URL stays recorded).
 *
 * What counts as an image: PNG, JPEG, GIF or WebP, decided by the file's own first bytes as well
 * as the type it was served with. SVG is refused (it can carry script), and so is anything over
 * MAX_IMAGE_BYTES.
 */

import type { ForgeFeed } from "./feed";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Downloads at once. */
export const IMAGE_CONCURRENCY = 3;
/** The whole copy stops starting new downloads after this long; the rest wait for the next run. */
export const IMAGE_BUDGET_MS = 120_000;

export type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/** The image type from its first bytes, or null when it isn't one we accept. */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** The served type must be an image type we accept (parameters like "; charset" ignored). */
export function acceptableContentType(contentType: string | null): boolean {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return t === "image/png" || t === "image/jpeg" || t === "image/jpg" || t === "image/gif" || t === "image/webp";
}

/** Only http(s) addresses are ever fetched. */
export function isFetchableImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** The images a card has already copied: metadata.forge.images, source URL → attachment id. */
export function copiedImages(metadata: unknown): Record<string, string> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const forge = (metadata as Record<string, unknown>).forge;
  if (!forge || typeof forge !== "object" || Array.isArray(forge)) return {};
  const images = (forge as Record<string, unknown>).images;
  if (!images || typeof images !== "object" || Array.isArray(images)) return {};
  const out: Record<string, string> = {};
  for (const [url, id] of Object.entries(images as Record<string, unknown>)) if (typeof id === "string") out[url] = id;
  return out;
}

export interface ImageJob {
  forgeId: string;
  taskId: string;
  url: string;
}

/**
 * The images still to copy: for every feed item whose card exists on this board, each of its
 * http(s) images the card hasn't recorded yet. An item without a card (waiting, skipped, or not
 * imported yet) has nothing to copy until it does.
 */
export function imageJobs(
  feed: Pick<ForgeFeed, "items">,
  cards: ReadonlyArray<{ id: string; externalRef: string | null; metadata: unknown }>,
): ImageJob[] {
  const byRef = new Map(cards.filter((c) => c.externalRef).map((c) => [c.externalRef as string, c]));
  const jobs: ImageJob[] = [];
  for (const item of feed.items) {
    const card = byRef.get(`forge:${item.id}`);
    if (!card) continue;
    const done = copiedImages(card.metadata);
    const seen = new Set<string>();
    for (const url of item.images) {
      if (!isFetchableImageUrl(url) || done[url] || seen.has(url)) continue;
      seen.add(url);
      jobs.push({ forgeId: item.id, taskId: card.id, url });
    }
  }
  return jobs;
}

/** "WhatsApp-Image-2026-05-15.jpeg" from the address, for the attachment's name. */
export function imageFilename(url: string): string | null {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
    return last ? last.slice(0, 200) : null;
  } catch {
    return null;
  }
}
