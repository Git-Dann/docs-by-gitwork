import type { NextRequest } from "next/server";

import {
  renderCountermarkBadge,
  type CountermarkStyle,
} from "@/lib/badge/countermark-badge";
import { getCountermarkByToken } from "@/server/provenance/issue";
import type { BadgeTheme } from "@/lib/badge/svg-kit";

/**
 * GET /api/badge/countermark/[token]  (PUBLIC — no API key)
 *
 * The embeddable face of a Provenance Countermark: an `<img>`-able SVG a client can
 * put in their own footer, beside the certificate it links to.
 *
 *   <a href="https://foundry.gitwork.co.uk/countermark/<token>">
 *     <img src="https://foundry.gitwork.co.uk/api/badge/countermark/<token>.svg">
 *   </a>
 *
 * ## Auth, and why there is none beyond the token
 *
 * `token` is the same `Countermark.token` that serves the public certificate at
 * `/countermark/[token]`, so the badge is exactly as public as the page it
 * points at and shows strictly less. A withdrawn mark keeps resolving and says
 * REVOKED — that is deliberate in Provenance and is preserved here, because a
 * counterparty who was handed a mark needs to be able to discover that it was
 * withdrawn, not get a 404 they might read as a mistake.
 *
 * ## Never cached beyond a minute, and never at the CDN
 *
 * Unlike the Pulse score badge, this one is **time-dependent**: it renders days
 * remaining and flips VALID → EXPIRING → LAPSED on its own, with no write to
 * invalidate against. A long cache would leave a lapsed mark advertising itself
 * as certified, which is the exact failure this product exists to prevent. Sixty
 * seconds, `must-revalidate`, no `s-maxage`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

function parseStyle(v: string | null): CountermarkStyle {
  return v === "disc" || v === "card" ? v : "shield";
}

function parseTheme(v: string | null): BadgeTheme {
  return v === "dark" ? "dark" : "light";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  // `.svg` is accepted and ignored so the URL can end in a real file extension —
  // some CMSes won't treat an extensionless URL as an image.
  const token = raw.replace(/\.svg$/i, "");

  const mark = await getCountermarkByToken(token);
  if (!mark) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // The full window the mark was issued for, so the disc can show how much is
  // left. Derived from the record rather than the standard, so a mark issued
  // under an older validity policy still draws its own window correctly.
  const issued = Date.parse(mark.issuedAt);
  const expires = Date.parse(mark.expiresAt);
  const validityDays =
    Number.isFinite(issued) && Number.isFinite(expires) && expires > issued
      ? Math.max(1, Math.round((expires - issued) / DAY_MS))
      : 90;

  const q = request.nextUrl.searchParams;
  const { svg } = renderCountermarkBadge({
    grade: mark.grade,
    status: mark.status,
    daysRemaining: mark.daysRemaining,
    validityDays,
    sealed: mark.seal !== null,
    subject: mark.subjectName,
    standard: `${mark.standardId} v${mark.standardVersion}`,
    style: parseStyle(q.get("style")),
    theme: parseTheme(q.get("theme")),
    motion: q.get("motion") === "1",
  });

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Short and revalidated: this badge ages on its own.
      "Cache-Control": "public, max-age=60, must-revalidate",
      // Hotlinked from client sites by design.
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
