/**
 * Path probes that read what came back. A 200 is not an answer: vercel.com serves its
 * homepage for /.git/config, /phpinfo.php and /backup.sql; cbc.ca serves a "Menu" page;
 * github.com/telescope is a user called telescope. Every probe here decides from the
 * body — the file's own format, the tool's own markup, or a page that names itself.
 */
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";
import { assertHostResponding, recordTimeout } from "./host-breaker";

/** What a sensitive-path probe saw: the status, and the first few KB of what came back. */
export interface PathProbe { status: number; contentType: string; body: string; finalUrl?: string }

/**
 * GET a path and read only the start of the body. 0 = the request failed. The read is
 * capped because a soft-routed path can answer with a multi-megabyte homepage.
 */
export async function fetchSnippet(url: string, timeoutMs = 4000, maxBytes = 16_384): Promise<PathProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    assertHostResponding(url);
    const res = await fetchScannableUrl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    }).catch((e) => { if (controller.signal.aborted) recordTimeout(url); throw e; });
    let body = "";
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        bytes += value.byteLength;
        body += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    }
    return { status: res.status, contentType: res.headers.get("content-type") ?? "", body: body.slice(0, maxBytes), finalUrl: res.url || url };
  } catch {
    return { status: 0, contentType: "", body: "" };
  } finally {
    clearTimeout(timer);
  }
}

// Each signature names the thing itself, never a word a normal page could contain.
export const looksLikePhpInfo = (body: string) =>
  /<title>\s*phpinfo\(\)/i.test(body) || (/PHP Version\s*\d/i.test(body) && /\b(Configuration File|php\.ini|Zend Engine)\b/i.test(body));
export const looksLikeGitConfig = (body: string) =>
  /^\s*\[core\]/m.test(body) && /^\s*(repositoryformatversion|bare|filemode)\s*=/m.test(body);
export const looksLikeSqlDump = (body: string) =>
  /(--\s*(MySQL|MariaDB) dump|--\s*PostgreSQL database dump|^\s*CREATE TABLE\b|^\s*INSERT INTO\b|^\s*DROP TABLE\b|^\s*PRAGMA\s|^\s*BEGIN TRANSACTION)/im.test(body);
export const looksLikeEnvFile = (body: string) => {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  return lines.length > 0 && lines.slice(0, 20).filter((l) => /^(export\s+)?[A-Z][A-Z0-9_]*\s*=/.test(l)).length >= Math.min(2, lines.length)
    && !/<html|<body|<div/i.test(body);
};
export const looksLikeAdminLogin = (body: string) =>
  /type=["']?password/i.test(body)
  && /(<title>[^<]*(admin|log ?in|sign ?in|dashboard)|wp-login|id=["']?loginform|name=["']?log["'\s>])/i.test(body);
export const looksLikeOpenApi = (body: string) =>
  /^\s*\{[\s\S]*"(openapi|swagger)"\s*:\s*"\d/.test(body) || /^\s*(openapi|swagger)\s*:\s*["']?\d/m.test(body)
  || /SwaggerUIBundle|swagger-ui|<redoc\b|redoc\.standalone/i.test(body);
/** GET /graphql with no query: servers answer with a GraphQL error envelope or an IDE page. */
export const looksLikeGraphqlEndpoint = (p: PathProbe) =>
  (/json/i.test(p.contentType) && /"errors"\s*:\s*\[/.test(p.body) && /query|graphql|operation/i.test(p.body))
  || /graphiql|graphql-playground|apollo.{0,20}(sandbox|studio)/i.test(p.body);
/**
 * Does a page about TOPIC exist at this path? A 200 is not an answer: vercel.com serves its
 * homepage for paths it does not have, cbc.ca serves a "Menu" page, and a redirect to "/"
 * follows to a 200. So the page has to name itself — in its title, a top heading, or the
 * URL it settled on. A 200 that does not is "unverified", which the caller reports as
 * could-not-establish rather than guessing either way.
 */
export type PageProbeState = "present" | "absent" | "unverified" | "failed";
const normTitle = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
export function pageTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(html);
  return m ? normTitle(m[1]) : "";
}
export function classifyTopicPage(probe: PathProbe, requestedPath: string, topic: RegExp, homeTitle: string | null): PageProbeState {
  if (probe.status === 0) return "failed";
  if (probe.status === 404 || probe.status === 410) return "absent";
  if (probe.status !== 200) return "unverified";
  let finalPath = requestedPath;
  try { finalPath = new URL(probe.finalUrl ?? "", "https://x.invalid").pathname; } catch { /* keep requested */ }
  // Followed a redirect back to the homepage: there is no such page.
  if (requestedPath !== "/" && (finalPath === "/" || finalPath === "")) return "absent";
  const headings: string[] = [pageTitle(probe.body)];
  const re = /<h[12][^>]*>([\s\S]{0,300}?)<\/h[12]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(probe.body)) && headings.length < 6) headings.push(normTitle(m[1]));
  let ownPath = finalPath.toLowerCase().replace(/[-_/]+/g, " ");
  try { ownPath = decodeURIComponent(finalPath).toLowerCase().replace(/[-_/]+/g, " "); } catch { /* keep raw */ }
  const title = headings[0];
  // The homepage served under another path is not the page, whatever its title says.
  if (homeTitle && title && title === homeTitle) return "unverified";
  // A downloadable pack is the thing itself: anthropic.com/press-kit 307s straight to a
  // .zip. When the requested path names the topic and the answer is an archive or PDF —
  // not a page that could be a homepage soft-route — the asset exists.
  if (/^application\/(zip|x-zip-compressed|pdf)\b/i.test(probe.contentType) && topic.test(requestedPath.toLowerCase().replace(/[-_/]+/g, " "))) return "present";
  if (headings.some((h) => topic.test(h))) return "present";
  if (finalPath !== requestedPath && topic.test(ownPath)) return "present";
  return "unverified";
}
/** Strongest answer across candidate paths: any present wins; then unverified, failed, absent. */
export function combinePageStates(...states: PageProbeState[]): PageProbeState {
  // Strongest answer first. Written as a chain rather than a list literal so the
  // catalogue guard does not read the state names as check keys.
  if (states.includes("present")) return "present";
  if (states.includes("unverified")) return "unverified";
  if (states.includes("failed")) return "failed";
  return "absent";
}

export function looksLikeDebugTool(path: string, probe: PathProbe): boolean {
  const b = probe.body;
  if (path === "/telescope") return /vendor\/telescope|window\.Telescope\s*=|<title>\s*Telescope\b/.test(b);
  if (path === "/horizon") return /vendor\/horizon|window\.Horizon\s*=|<title>\s*Horizon\b/.test(b);
  if (path === "/__clockwork") return /<title>\s*Clockwork\b|vendor\/clockwork/i.test(b) || (/json/i.test(probe.contentType) && /"(id|requests)"[\s\S]*"(responseDuration|controller|databaseQueries)"/.test(b));
  return /(Werkzeug Debugger|sf-toolbar|Symfony Profiler|djDebug|Django Debug Toolbar|<title>\s*Debug(ger)?\b)/i.test(b);
}

