/**
 * Media cells — images, videos and files linked from a Sheet (CLAUDE.md §73.1). Pure.
 *
 * A media cell is a list of `{ url, title? }`. Three rules, each tested:
 *
 *   1. **Only http(s), through the same rule as the `link` type** (`safeSheetLink`). A
 *      `javascript:` or `data:` URL never becomes a value.
 *   2. **Nothing is fetched by us.** No thumbnails, no oEmbed, no HEAD — a server that
 *      fetches a caller's URL is an SSRF vector. Kind and title are read from the URL alone.
 *   3. **An embed URL is BUILT, never passed through.** YouTube / Vimeo / Loom are
 *      recognised by exact host (or a subdomain of it — `youtube.com.evil.com` is not
 *      YouTube), the video id is parsed and checked against its format, and the player URL
 *      is assembled from a fixed origin plus that id. The user's URL never reaches an
 *      `<iframe src>`.
 */

import { parseSheetFileUrl } from "@/lib/wiki-sheet-files";
import { safeSheetLink } from "@/lib/wiki-sheet-links";
import type { SheetMediaItem } from "@/types/wiki-sheets";

export const MEDIA_LIMITS = { maxItems: 10, maxTitle: 120 } as const;

export type MediaKind = "image" | "video" | "youtube" | "vimeo" | "loom" | "drive" | "figma" | "file";

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  image: "Image",
  video: "Video",
  youtube: "YouTube video",
  vimeo: "Vimeo video",
  loom: "Loom recording",
  drive: "Google Drive file",
  figma: "Figma file",
  file: "File",
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;

/** `host` is `domain` or a subdomain of it. Never a suffix match on the bare string. */
function onHost(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === domain || h.endsWith(`.${domain}`);
}

/** A media item's URL as stored: an http(s) link, or exactly an uploaded image's path (§73.2). */
export function safeMediaUrl(raw: string): string | null {
  if (parseSheetFileUrl(raw)) return raw.trim();
  return safeSheetLink(raw);
}

function parse(url: string): URL | null {
  if (parseSheetFileUrl(url)) return new URL(url.trim(), "https://upload.invalid");
  const safe = safeSheetLink(url);
  if (!safe) return null;
  try {
    return new URL(safe);
  } catch {
    return null;
  }
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[a-f0-9]{6,20}$/i;
const LOOM_ID = /^[a-f0-9]{16,64}$/i;

function youTubeId(u: URL): string | null {
  const parts = u.pathname.split("/").filter(Boolean);
  if (onHost(u.hostname, "youtu.be")) return parts[0] && YT_ID.test(parts[0]) ? parts[0] : null;
  if (!onHost(u.hostname, "youtube.com") && !onHost(u.hostname, "youtube-nocookie.com")) return null;
  if (parts[0] === "watch") {
    const v = u.searchParams.get("v");
    return v && YT_ID.test(v) ? v : null;
  }
  if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "") && parts[1] && YT_ID.test(parts[1])) return parts[1];
  return null;
}

function vimeo(u: URL): { id: string; hash: string | null } | null {
  if (!onHost(u.hostname, "vimeo.com")) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const at = parts[0] === "video" ? 1 : 0;
  const id = parts[at];
  if (!id || !VIMEO_ID.test(id)) return null;
  const hash = parts[at + 1] && VIMEO_HASH.test(parts[at + 1]) ? parts[at + 1] : u.searchParams.get("h");
  return { id, hash: hash && VIMEO_HASH.test(hash) ? hash : null };
}

function loomId(u: URL): string | null {
  if (!onHost(u.hostname, "loom.com")) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if ((parts[0] === "share" || parts[0] === "embed") && parts[1] && LOOM_ID.test(parts[1])) return parts[1];
  return null;
}

/** What a link points at, read from the URL alone. Unsafe → null. */
export function mediaKind(url: string): MediaKind | null {
  const u = parse(url);
  if (!u) return null;
  if (youTubeId(u)) return "youtube";
  if (vimeo(u)) return "vimeo";
  if (loomId(u)) return "loom";
  if (onHost(u.hostname, "drive.google.com") || onHost(u.hostname, "docs.google.com")) return "drive";
  if (onHost(u.hostname, "figma.com")) return "figma";
  if (IMAGE_EXT.test(u.pathname)) return "image";
  if (VIDEO_EXT.test(u.pathname)) return "video";
  return "file";
}

/**
 * The player URL for an embeddable video — assembled from a fixed origin and a parsed,
 * format-checked id. Null for anything that isn't one of the three allow-listed players.
 */
export function mediaEmbedUrl(url: string): string | null {
  const u = parse(url);
  if (!u) return null;
  const yt = youTubeId(u);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const v = vimeo(u);
  if (v) return `https://player.vimeo.com/video/${v.id}${v.hash ? `?h=${v.hash}` : ""}`;
  const loom = loomId(u);
  if (loom) return `https://www.loom.com/embed/${loom}`;
  return null;
}

/** The hosts an embed may come from. The viewer refuses any other origin outright. */
export const EMBED_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://www.loom.com",
] as const;

function fileName(u: URL): string | null {
  const last = u.pathname.split("/").filter(Boolean).pop();
  if (!last) return null;
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    /* keep it encoded */
  }
  name = name.replace(/\s+/g, " ").trim();
  if (!name) return null;
  return name.length > 60 ? `${name.slice(0, 57)}…` : name;
}

/** The title a chip shows: the one given, else a tidy one derived from the URL — never the raw URL. */
export function mediaTitle(item: SheetMediaItem): string {
  if (item.title?.trim()) return item.title.trim();
  const kind = mediaKind(item.url) ?? "file";
  const u = parse(item.url);
  if (kind === "image" || kind === "video" || kind === "file") {
    return (u && fileName(u)) || (u ? u.hostname.replace(/^www\./, "") : MEDIA_KIND_LABEL[kind]);
  }
  return MEDIA_KIND_LABEL[kind];
}

export type MediaCoerce = { ok: true; value: SheetMediaItem[] | null } | { ok: false; error: string };

/** Split pasted text into URLs: whitespace, or a comma that starts another link. */
export function splitMediaText(text: string): string[] {
  return text
    .split(/\s+|,(?=\s*(?:https?:\/\/|www\.))/i)
    .map((s) => s.trim().replace(/,$/, ""))
    .filter(Boolean);
}

/**
 * Accepts a URL string (several separated by whitespace), an array of URLs, or
 * `{ url, title }` objects. Returns the stored list, or a sentence saying what's wrong.
 */
export function coerceMedia(raw: unknown, label = "This column"): MediaCoerce {
  let items: unknown[];
  if (typeof raw === "string") items = splitMediaText(raw);
  else if (Array.isArray(raw)) items = raw;
  else if (raw && typeof raw === "object") items = [raw];
  else return { ok: false, error: `${label} takes image or video links.` };

  const out: SheetMediaItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const urlRaw = typeof item === "string" ? item : item && typeof item === "object" ? (item as Record<string, unknown>).url : null;
    const titleRaw = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>).title : undefined;
    if (typeof urlRaw !== "string" || !urlRaw.trim()) {
      if (typeof item === "string") continue;
      return { ok: false, error: `${label} takes links with a "url".` };
    }
    const url = safeMediaUrl(urlRaw);
    if (!url) {
      const shown = urlRaw.trim().length > 40 ? `${urlRaw.trim().slice(0, 40)}…` : urlRaw.trim();
      return { ok: false, error: `${label} takes http(s) links — "${shown}" isn't one.` };
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const title = typeof titleRaw === "string" ? titleRaw.replace(/\s+/g, " ").trim().slice(0, MEDIA_LIMITS.maxTitle) : "";
    out.push(title ? { url, title } : { url });
  }
  if (out.length > MEDIA_LIMITS.maxItems) {
    return { ok: false, error: `${label} holds at most ${MEDIA_LIMITS.maxItems} links per cell.` };
  }
  return { ok: true, value: out.length ? out : null };
}

export function isMediaList(value: unknown): value is SheetMediaItem[] {
  return Array.isArray(value) && value.every((v) => v && typeof v === "object" && typeof (v as SheetMediaItem).url === "string");
}
