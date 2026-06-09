// Shared, dependency-light helpers used by the channel adapters. Kept separate from the
// registry/core so adapters can import them without pulling in the whole module graph.

export function normalizeKeywords(list?: string[]): string[] {
  return (list ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
}

/**
 * Returns true if `text` passes the include/exclude keyword filters.
 * - include: if non-empty, text must contain at least one term
 * - exclude: if any term is present, the item is rejected
 */
export function passesKeywordFilters(text: string, include: string[], exclude: string[]): boolean {
  const lower = text.toLowerCase();
  if (exclude.length > 0 && exclude.some((kw) => lower.includes(kw))) return false;
  if (include.length > 0 && !include.some((kw) => lower.includes(kw))) return false;
  return true;
}

export function lookbackSeconds(lookbackDays: number | undefined, fallbackDays: number): number {
  const days = lookbackDays && lookbackDays > 0 ? lookbackDays : fallbackDays;
  return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
}

// ─── Reddit RSS helpers ───────────────────────────────────────────────────────

export interface RedditRssPost {
  id: string;
  title: string;
  author: string;
  body: string;
  permalink: string;
  created_utc: number;
}

function xmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m?.[1]?.trim() ?? "";
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseRedditAtom(xml: string): RedditRssPost[] {
  const posts: RedditRssPost[] = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    // The real permalink is in <link href="...">; the <id> tag is a "t3_xxx" URN, NOT a
    // /comments/ URL. Prefer the link's post id, fall back to stripping the URN prefix.
    const linkHref = decodeXmlEntities(entry.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const idTag = decodeXmlEntities(xmlTag(entry, "id"));
    const postId = linkHref.match(/\/comments\/([a-z0-9]+)\b/i)?.[1] ?? (idTag.replace(/^t\d+_/, "").trim() || "");
    if (!postId) continue;
    const permalink = linkHref || idTag;
    const title = decodeXmlEntities(xmlTag(entry, "title"));
    if (!title) continue;
    const author = decodeXmlEntities(xmlTag(entry, "name")).replace(/^\/u\//, "");
    const updatedStr = xmlTag(entry, "updated");
    const created_utc = updatedStr ? Math.floor(new Date(updatedStr).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const contentHtml = decodeXmlEntities(xmlTag(entry, "content"));
    const body = stripHtml(contentHtml);
    posts.push({ id: postId, title, author: author || "unknown", body, permalink, created_utc });
  }
  return posts;
}

// ─── Gmail body extraction ────────────────────────────────────────────────────

// Gmail API types: `mimeType` is `string | null | undefined`. Widening here so
// callers can hand us the raw Schema$Message without an intermediate cast.
export function extractGmailBodyText(msg: { payload?: { parts?: unknown[]; body?: { data?: string | null }; mimeType?: string | null } | null }): string {
  const payload = msg.payload;
  if (!payload) return "";

  function decodeBase64(data: string): string {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  }

  function extractFromParts(parts: unknown[]): string {
    const p = parts as Array<{ mimeType?: string; body?: { data?: string | null }; parts?: unknown[] }>;
    for (const part of p) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64(part.body.data);
    }
    for (const part of p) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    for (const part of p) {
      if (part.parts) {
        const found = extractFromParts(part.parts);
        if (found) return found;
      }
    }
    return "";
  }

  if (payload.parts) return extractFromParts(payload.parts);
  if (payload.body?.data) return decodeBase64(payload.body.data);
  return "";
}
