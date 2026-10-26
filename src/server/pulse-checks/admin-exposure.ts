/**
 * Is an admin area open to anyone? Following /wp-admin to wp-login.php, or Django's
 * /admin to /admin/login, lands on a sign-in form: the admin IS protected, and the old
 * check reported that as an exposed admin panel at HIGH severity. Exposure is an admin
 * page served to an anonymous visitor with no sign-in form, showing the signs of a
 * signed-in session (a dashboard, a log-out link).
 */
import { fetchSnippet, looksLikeAdminLogin, type PathProbe } from "./path-probe";

const hasPasswordField = (body: string) => /<input\b[^>]*\stype\s*=\s*["']?password\b/i.test(body);

export type OpenAdminKind = "WordPress" | "Django" | "phpMyAdmin" | "generic";

/**
 * Which admin dashboard, if any, the body is. The named products are recognised by
 * their own markup; "generic" is any page titled admin/dashboard that offers a log-out
 * link to a visitor who never signed in.
 */
export function openAdminKind(body: string): OpenAdminKind | null {
  if (hasPasswordField(body)) return null;
  const title = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(body)?.[1] ?? "";
  if (/\bid=["']wpadminbar["']/i.test(body) && /\bDashboard\b/i.test(title)) return "WordPress";
  if (/Site administration\s*\|\s*Django site admin/i.test(title)) return "Django";
  if (/\bphpMyAdmin\b/i.test(title) && /\b(?:server_databases|pma_navigation|navigation_tree)\b/i.test(body)) return "phpMyAdmin";
  if (/\badmin(?:istration)?\b|\bdashboard\b/i.test(title) && /<a\b[^>]*\shref\s*=\s*["'][^"']*\b(?:log-?out|sign-?out)\b/i.test(body)) return "generic";
  return null;
}

export interface AdminProbeResult {
  statuses: number[];
  /** Paths serving an admin page to an anonymous visitor, with what it was recognised as. */
  exposed: Array<{ path: string; kind: OpenAdminKind }>;
  /** Paths that answered with an admin sign-in form. */
  loginPaths: string[];
}

export async function probeAdminPaths(baseUrl: string, paths = ["/admin", "/wp-admin"]): Promise<AdminProbeResult> {
  const results: PathProbe[] = await Promise.all(paths.map((path) => fetchSnippet(`${baseUrl}${path}`, 4000)));
  return classifyAdminProbes(paths, results);
}

export function classifyAdminProbes(paths: string[], results: PathProbe[]): AdminProbeResult {
  const exposed: AdminProbeResult["exposed"] = [];
  const loginPaths: string[] = [];
  paths.forEach((path, i) => {
    if (results[i].status !== 200) return;
    const kind = openAdminKind(results[i].body);
    if (kind) exposed.push({ path, kind });
    else if (looksLikeAdminLogin(results[i].body)) loginPaths.push(path);
  });
  return { statuses: results.map((r) => r.status), exposed, loginPaths };
}

/** The verdict for no_exposed_admin. */
export function adminExposureVerdict(r: AdminProbeResult): { status: "PASS" | "WARN" | "FAIL" | "INCONCLUSIVE"; detail: string; evidence?: string } {
  const named = r.exposed.find((e) => e.kind !== "generic");
  if (named) return { status: "FAIL", detail: `${named.path} serves the ${named.kind} admin dashboard to a visitor who has not signed in. Anyone can reach the admin area; put it behind a sign-in immediately.`, evidence: `GET ${named.path} → ${named.kind} admin dashboard, no sign-in form` };
  if (r.exposed.length > 0) return { status: "WARN", detail: `${r.exposed[0].path} serves an admin dashboard page with a log-out link to a visitor who has not signed in. Check whether this is a real admin area or a public demo.`, evidence: `GET ${r.exposed[0].path} → admin page with log-out link, no sign-in form` };
  if (r.statuses.some((s) => s === 0)) return { status: "INCONCLUSIVE", detail: "One or more admin-path probes failed, so whether an admin area is open could not be established." };
  if (r.loginPaths.length > 0) return { status: "PASS", detail: `The admin area at ${r.loginPaths.join(", ")} asks for a sign-in, so it is not open to anonymous visitors. Rate limiting and multi-factor sign-in on that page cannot be checked from outside.`, evidence: `GET ${r.loginPaths.join(", ")} → sign-in form` };
  return { status: "PASS", detail: "No admin dashboard is served at /admin or /wp-admin to a visitor who has not signed in." };
}
