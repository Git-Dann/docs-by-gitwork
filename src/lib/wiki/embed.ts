/**
 * Turn a pasted link into an embeddable one — for a known provider only.
 *
 * ⚠️ PURE, and no network. The obvious way to get a title and thumbnail for an
 * arbitrary URL is oEmbed, which means the server fetching a link somebody typed
 * — an SSRF vector, and the exact thing §40.1 refuses for intake attachments
 * ("stored as links and never fetched"). So this derives the embed URL from the
 * URL's own shape, against an ALLOW-LIST, and anything unrecognised stays a
 * plain link card.
 *
 * ⚠️ An allow-list, not a blocklist. An `<iframe src>` we build from a pasted
 * string is a page we are choosing to run inside the client's wiki; the set of
 * origins that can do that is a decision, not a default.
 */

export type EmbedKind = "video" | "design" | "doc";

export interface Embed {
  /** The URL to put in the iframe. */
  src: string;
  kind: EmbedKind;
  /** Provider name for the card's label. */
  provider: string;
  /** Intrinsic aspect ratio, so the frame reserves the right space. */
  ratio: number;
}

/** 16:9 for video, 4:3 for documents that scroll. */
const WIDE = 16 / 9;

function id(match: RegExpMatchArray | null, group = 1): string | null {
  return match?.[group] ?? null;
}

export function embedFor(rawUrl: string | null | undefined): Embed | null {
  if (!rawUrl) return null;

  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  // http(s) only.
  //
  // ⚠️ Honestly: this is REDUNDANT today. Every branch below keys on `hostname`,
  // and `javascript:` / `data:` / `file:` URLs parse with an empty hostname, so
  // they already fall through to null — proved by sabotage, which deleted this
  // line and failed nothing. It stays as the one check that does not depend on
  // every future provider branch remembering to match a host.
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;

  // ── Loom ─────────────────────────────────────────────────────────────────
  // /share/<id> is the link people copy; /embed/<id> is the same recording in a
  // player. Both forms are accepted so a pasted embed URL is not treated as
  // unknown.
  if (host === "loom.com" || host.endsWith(".loom.com")) {
    const loom = id(path.match(/^\/(?:share|embed)\/([0-9a-zA-Z]+)/));
    if (loom) {
      return { src: `https://www.loom.com/embed/${loom}`, kind: "video", provider: "Loom", ratio: WIDE };
    }
    return null;
  }

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (host === "youtu.be") {
    const yt = id(path.match(/^\/([\w-]{6,})/));
    return yt
      ? { src: `https://www.youtube-nocookie.com/embed/${yt}`, kind: "video", provider: "YouTube", ratio: WIDE }
      : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const yt = u.searchParams.get("v") ?? id(path.match(/^\/(?:embed|shorts)\/([\w-]{6,})/));
    return yt
      ? // `-nocookie` deliberately: this renders on a CLIENT-facing wiki, and the
        // standard domain sets tracking cookies for a third party on our page.
        { src: `https://www.youtube-nocookie.com/embed/${yt}`, kind: "video", provider: "YouTube", ratio: WIDE }
      : null;
  }

  // ── Vimeo ────────────────────────────────────────────────────────────────
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const v = id(path.match(/\/(\d{6,})/));
    return v
      ? { src: `https://player.vimeo.com/video/${v}`, kind: "video", provider: "Vimeo", ratio: WIDE }
      : null;
  }

  // ── Figma ────────────────────────────────────────────────────────────────
  if (host === "figma.com" || host.endsWith(".figma.com")) {
    if (!/^\/(file|design|proto|board|slides)\//.test(path)) return null;
    return {
      src: `https://embed.figma.com/${path.replace(/^\//, "")}?embed-host=foundry`,
      kind: "design",
      provider: "Figma",
      ratio: WIDE,
    };
  }

  // ── Google Drive / Docs ──────────────────────────────────────────────────
  if (host === "drive.google.com") {
    const f = id(path.match(/\/file\/d\/([\w-]+)/));
    return f
      ? { src: `https://drive.google.com/file/d/${f}/preview`, kind: "doc", provider: "Google Drive", ratio: 4 / 3 }
      : null;
  }
  if (host === "docs.google.com") {
    // /preview renders read-only and does not expose the editing chrome.
    const m = path.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
    if (!m) return null;
    const kindPath = m[1] === "presentation" ? "embed" : "preview";
    return {
      src: `https://docs.google.com/${m[1]}/d/${m[2]}/${kindPath}`,
      kind: "doc",
      provider: "Google Docs",
      ratio: m[1] === "presentation" ? WIDE : 4 / 3,
    };
  }

  return null;
}

/** Providers this understands, for the empty-state copy. Kept beside the logic. */
export const EMBED_PROVIDERS = ["Loom", "YouTube", "Vimeo", "Figma", "Google Drive", "Google Docs"];
