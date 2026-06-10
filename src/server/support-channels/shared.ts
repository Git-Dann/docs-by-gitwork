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

/**
 * HTML → readable plain text for email bodies. Unlike `stripHtml` (used for Reddit
 * Atom, which wants everything on one line), this drops <script>/<style>, turns block
 * tags into line breaks, and decodes the common entities — so a multi-part email's
 * HTML alternative reads like the original message.
 */
function emailHtmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
// Some senders' plaintext alternative is just a stub pointing at the HTML part
// (e.g. "Please view this email in HTML format."). When we see that, fall through
// to the HTML body — that's where the real content lives.
const PLAINTEXT_STUB = /please view this email in html|view (this|the) email in html|this is an html (email|message)/i;

export function extractGmailBodyText(msg: { payload?: { parts?: unknown[]; body?: { data?: string | null }; mimeType?: string | null } | null }): string {
  const payload = msg.payload;
  if (!payload) return "";

  function decodeBase64(data: string): string {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  }

  // Walk the MIME tree once, capturing the first text/plain and first text/html parts.
  let plain = "";
  let html = "";
  function walk(parts: unknown[]): void {
    const p = parts as Array<{ mimeType?: string; body?: { data?: string | null }; parts?: unknown[] }>;
    for (const part of p) {
      if (!plain && part.mimeType === "text/plain" && part.body?.data) plain = decodeBase64(part.body.data);
      if (!html && part.mimeType === "text/html" && part.body?.data) html = decodeBase64(part.body.data);
      if (part.parts) walk(part.parts);
    }
  }

  if (payload.parts) {
    walk(payload.parts);
  } else if (payload.body?.data) {
    const data = decodeBase64(payload.body.data);
    if (payload.mimeType === "text/html") html = data;
    else plain = data;
  }

  const plainTrim = plain.trim();
  const htmlText = html ? emailHtmlToText(html) : "";

  // Prefer real plaintext; skip the HTML-only stub and use the HTML body instead.
  if (plainTrim && !PLAINTEXT_STUB.test(plainTrim)) return plainTrim;
  if (htmlText) return htmlText;
  return plainTrim;
}
