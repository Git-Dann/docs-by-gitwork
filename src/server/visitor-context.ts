/**
 * Visitor context helpers for public document tracking (Phase 1).
 *
 * Pure, dependency-free extraction of the things we want to know about a public visitor from the
 * request: their IP, coarse geo (from Vercel's edge headers), and a coarse device/browser/OS
 * classification (from the User-Agent). All best-effort — every field can be null off-Vercel or
 * for odd clients. We deliberately avoid a UA-parsing dependency: a few regexes give us the
 * display-grade buckets ("Mobile · Safari · iOS") that the analytics UI needs, nothing more.
 */

export interface ParsedUserAgent {
  device: "mobile" | "tablet" | "desktop" | "bot" | null;
  browser: string | null;
  os: string | null;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { device: null, browser: null, os: null };
  const s = ua.toLowerCase();

  // Device
  let device: ParsedUserAgent["device"];
  if (/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview/.test(s)) {
    device = "bot";
  } else if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/.test(s)) {
    device = "tablet";
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)) {
    device = "mobile";
  } else {
    device = "desktop";
  }

  // OS
  let os: string | null = null;
  if (/iphone|ipad|ipod/.test(s)) os = "iOS";
  else if (/android/.test(s)) os = "Android";
  else if (/mac os x|macintosh/.test(s)) os = "macOS";
  else if (/windows/.test(s)) os = "Windows";
  else if (/cros/.test(s)) os = "ChromeOS";
  else if (/linux/.test(s)) os = "Linux";

  // Browser (order matters — Edge/Chrome both contain "chrome"/"safari")
  let browser: string | null = null;
  if (/edg(e|ios|a)?\//.test(s)) browser = "Edge";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/samsungbrowser/.test(s)) browser = "Samsung Internet";
  else if (/firefox|fxios/.test(s)) browser = "Firefox";
  else if (/chrome|crios/.test(s)) browser = "Chrome";
  else if (/safari/.test(s)) browser = "Safari";

  return { device, browser, os };
}

/**
 * Coarse geo from whatever the edge/proxy in front of us provides.
 *
 * Since the move off Vercel to the VPS (nginx), the `x-vercel-ip-*` headers no
 * longer exist — geo silently became null everywhere, which is why doc-open
 * notifications degraded to printing a raw IP. We now read the common variants
 * (Cloudflare, nginx GeoIP2, Vercel) so geo works under any of them; when none
 * is present the caller falls back to an IP lookup (see resolveGeoForIp).
 */
export function geoFromRequest(req: Request): { country: string | null; city: string | null } {
  const country =
    req.headers.get("x-vercel-ip-country") || // Vercel (kept for the rollback path)
    req.headers.get("cf-ipcountry") || // Cloudflare
    req.headers.get("x-geoip-country") || // nginx GeoIP2 (if enabled on the VPS)
    null;
  const rawCity =
    req.headers.get("x-vercel-ip-city") ||
    req.headers.get("cf-ipcity") ||
    req.headers.get("x-geoip-city") ||
    null;
  // Vercel URL-encodes the city ("New%20York"); decode best-effort.
  let city: string | null = null;
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity);
    } catch {
      city = rawCity;
    }
  }
  return { country, city };
}

/** True for loopback/private/reserved addresses we should never geo-lookup. */
export function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/** Best-effort client IP from the usual proxy headers. */
export function clientIpFromRequest(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}
