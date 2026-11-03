/**
 * Authentication facts that can be read from a page's own markup: the password field's
 * length rule, an inline script writing a token to localStorage, and the OAuth
 * authorisation links the page links to. Each returns what it saw, or nothing; deciding
 * what "nothing" means is the caller's job, and on a public page it is usually
 * "could not establish" (CLAUDE.md §35). Pure, no I/O.
 */

/** A minimum password length the page states, and where it was read from. `copy` is readable text, one block per line. */
export function passwordRuleEvidence(html: string, copy: string): { min: number; source: string } | null {
  for (const input of html.match(/<input\b[^>]*>/gi) ?? []) {
    if (!/\stype\s*=\s*["']?password\b/i.test(input)) continue;
    const m = /\sminlength\s*=\s*["']?(\d{1,3})/i.exec(input);
    if (m) return { min: Number(m[1]), source: `password field minlength="${m[1]}"` };
  }
  const stated = /\bpasswords?\b[^.!?\n]{0,40}?\b(?:at least|a minimum of|minimum|min\.?)\s+(\d{1,2})\s+characters?\b|\b(?:at least|a minimum of)\s+(\d{1,2})\s+characters?\b[^.!?\n]{0,30}\bpasswords?\b/i.exec(copy);
  if (stated) {
    const n = Number(stated[1] ?? stated[2]);
    return { min: n, source: `"${stated[0].replace(/\s+/g, " ").trim().slice(0, 80)}"` };
  }
  return null;
}

/**
 * An inline script that stores a token under a token-named localStorage key. Scripts
 * loaded by src are not read here, so null means "not in the inline scripts", nothing more.
 */
export function tokenInLocalStorage(html: string): string | null {
  for (const block of html.match(/<script\b(?![^>]*\ssrc\s*=)[^>]*>[\s\S]*?<\/script\s*>/gi) ?? []) {
    const m = /localStorage\s*\.\s*setItem\s*\(\s*["'`]([\w.:-]{0,40}(?:jwt|token)[\w.:-]{0,40})["'`]/i.exec(block)
      ?? /localStorage\s*\[\s*["'`]([\w.:-]{0,40}(?:jwt|token)[\w.:-]{0,40})["'`]\s*\]\s*=(?!=)/i.exec(block);
    if (m) return `localStorage key "${m[1]}"`;
  }
  return null;
}

/** OAuth scopes that hand over far more than most features need. */
const BROAD_SCOPE = [
  // GitHub: full repository access, admin and destructive scopes.
  /^(?:repo|delete_repo|write:org|admin:[\w:]+)$/,
  // Google: whole mailbox, whole Drive, whole cloud project, workspace admin.
  /^https:\/\/mail\.google\.com\/?$/,
  /^https:\/\/www\.googleapis\.com\/auth\/(?:drive|gmail\.modify|cloud-platform|admin\.[\w.]+)$/,
  // Microsoft Graph: tenant-wide write.
  /^(?:https:\/\/graph\.microsoft\.com\/)?(?:[\w]+\.ReadWrite\.All|Directory\.[\w.]+|Mail\.ReadWrite)$/,
  // Slack and generic catch-alls.
  /^(?:admin(?:\.[\w:.]+)?|\*|all|full_access|write:all)$/i,
];

export interface OAuthLinkFindings {
  /** Authorisation-code links found, as host + path (query omitted). */
  links: string[];
  /** Of those, the ones with no code_challenge. */
  withoutPkce: string[];
  /** Every scope requested across the links. */
  scopes: string[];
  broadScopes: string[];
}

/**
 * OAuth authorisation links in the page's attributes (href, src, action, data-*). Only
 * a URL with response_type=code, or an authorize path carrying a client_id, counts.
 */
export function oauthLinkFindings(html: string): OAuthLinkFindings {
  const out: OAuthLinkFindings = { links: [], withoutPkce: [], scopes: [], broadScopes: [] };
  const urls = [...html.matchAll(/\s(?:href|src|action|data-[\w-]+)\s*=\s*["'](https?:\/\/[^"'\s]{10,2000})["']/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  for (const raw of urls) {
    let url: URL;
    try { url = new URL(raw); } catch { continue; }
    const q = url.searchParams;
    const isAuthorize = q.get("response_type") === "code"
      || (q.has("client_id") && /\/(?:oauth2?\/)?(?:v\d(?:\.\d)?\/)?(?:authorize|auth)\/?$/i.test(url.pathname));
    if (!isAuthorize || !q.has("client_id")) continue;
    const where = `${url.host}${url.pathname}`;
    if (out.links.includes(where)) continue;
    out.links.push(where);
    if (!q.get("code_challenge")) out.withoutPkce.push(where);
    for (const scope of (q.get("scope") ?? "").split(/[\s,+]+/).filter(Boolean)) {
      if (!out.scopes.includes(scope)) out.scopes.push(scope);
      if (BROAD_SCOPE.some((re) => re.test(scope)) && !out.broadScopes.includes(scope)) out.broadScopes.push(scope);
    }
  }
  return out;
}
