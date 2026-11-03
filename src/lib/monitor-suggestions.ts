/**
 * Monitors worth adding, read off a client's Platforms — the URLs Foundry already has on file.
 * Fellas Loaded had its production API, site and analytics recorded as platforms and no monitor
 * on any of them; this makes each one a click away. Pure, so the URL rules are tested.
 */

export interface MonitorSuggestion {
  name: string;
  target: string;
}

/** Comparable form of a URL: lower-case host, no trailing slash, no hash. */
export function normaliseTarget(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * An admin or login page is the wrong thing to watch — it answers with a redirect to a sign-in
 * screen whether or not the site works. Watch the site's root instead.
 */
function watchableUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (/\/(wp-admin|wp-login\.php|admin|login)(\/|$)/i.test(u.pathname)) return `${u.protocol}//${u.host}/`;
  return u.toString();
}

export function suggestMonitors(
  platforms: { name: string; url: string | null }[],
  existingTargets: string[],
): MonitorSuggestion[] {
  const taken = new Set(existingTargets.map(normaliseTarget));
  const out: MonitorSuggestion[] = [];
  for (const p of platforms) {
    if (!p.url) continue;
    const target = watchableUrl(p.url);
    if (!target) continue;
    const key = normaliseTarget(target);
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({ name: p.name, target });
  }
  return out;
}
