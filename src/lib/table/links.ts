/**
 * The one rule for a link a Sheet will render as an `<a href>`, an `<img src>` or a
 * `<video src>` (§43.4, §73). Its own tiny module so the `link` and `media` column types
 * share it without the two rule files importing each other.
 *
 * A protocol ALLOW-list, never a blocklist: `javascript://host/%0a…` has a hostname, so a
 * hostname check on its own lets it through.
 */

export const MAX_LINK_LENGTH = 2048;

export function safeSheetLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s)
    ? s
    : /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(s)
      ? `https://${s}`
      : null;
  if (!withScheme) return null;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname) return null;
    const out = url.toString();
    return out.length > MAX_LINK_LENGTH ? out.slice(0, MAX_LINK_LENGTH) : out;
  } catch {
    return null;
  }
}
