/**
 * GET /api/og-preview?url=https://...
 *
 * Fetches Open Graph metadata for a URL server-side (avoiding browser CORS).
 * Used by the Portal platform/design cards to auto-populate preview images
 * when a link is first saved.
 *
 * Returns: { imageUrl, title } — both nullable. Never 500s to the client.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return apiError("url param required", 400);

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return apiError("invalid url", 400);
  }

  // Basic SSRF guard — only public http/https
  if (!["http:", "https:"].includes(target.protocol)) {
    return apiError("only http/https urls are supported", 400);
  }
  const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254"];
  if (blocked.some((h) => target.hostname.startsWith(h))) {
    return apiError("private urls are not allowed", 400);
  }

  try {
    const res = await fetch(rawUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Foundry/1.0; +https://foundry.gitwork.co.uk)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(6_000),
      redirect: "follow",
    });

    if (!res.ok) {
      return apiOk({ imageUrl: null, title: null });
    }

    // Only parse the first 200 KB to keep this fast
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      while (total < 200_000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.length;
      }
      reader.cancel();
    }
    const html = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length);
        merged.set(acc);
        merged.set(c, acc.length);
        return merged;
      }, new Uint8Array(0)),
    );

    const extract = (patterns: RegExp[]): string | null => {
      for (const re of patterns) {
        const m = html.match(re);
        if (m?.[1]) return decode(m[1].trim());
      }
      return null;
    };

    const imageUrl = extract([
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    ]);

    const title = extract([
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([^<]{1,120})<\/title>/i,
    ]);

    // Resolve protocol-relative and root-relative image URLs
    let resolved = imageUrl;
    if (imageUrl) {
      if (imageUrl.startsWith("//")) {
        resolved = `${target.protocol}${imageUrl}`;
      } else if (imageUrl.startsWith("/")) {
        resolved = `${target.protocol}//${target.host}${imageUrl}`;
      }
    }

    return apiOk({ imageUrl: resolved, title });
  } catch {
    // Network error, timeout, etc. — always return gracefully
    return apiOk({ imageUrl: null, title: null });
  }
}

function decode(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
