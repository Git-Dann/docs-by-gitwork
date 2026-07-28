/**
 * RFC 9116 security.txt — the official route for a researcher to report a
 * vulnerability. Previously absent, so there was none.
 *
 * A route handler rather than a static file in public/ for one reason: RFC 9116
 * requires an `Expires` field, and a hardcoded date silently becomes invalid the
 * day it passes. This rolls a ~1-year expiry from the time of the request, so the
 * file cannot go stale. Cached for a day so it is still effectively static.
 *
 * `Content-Type: text/plain` is required by the RFC (and is what Pulse's own
 * security_txt check content-verifies, so a catch-all HTML shell can't pass for a
 * disclosure file).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  const body = [
    "# Responsible disclosure for Foundry by Gitwork.",
    "# Please give us a reasonable window to fix an issue before disclosing it.",
    "",
    "Contact: mailto:security@gitwork.co.uk",
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "Preferred-Languages: en",
    "Canonical: https://foundry.gitwork.co.uk/.well-known/security.txt",
    "",
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
