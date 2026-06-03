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

/** Coarse geo from Vercel's edge headers. Null when not behind Vercel (local dev). */
export function geoFromRequest(req: Request): { country: string | null; city: string | null } {
  const country = req.headers.get("x-vercel-ip-country") || null;
  const rawCity = req.headers.get("x-vercel-ip-city");
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

/** Best-effort client IP from the usual proxy headers. */
export function clientIpFromRequest(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}
