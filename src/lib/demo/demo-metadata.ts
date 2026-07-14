import type { Metadata } from "next";

/**
 * Shared OG / link-preview metadata for the `/demo` suite. When a client name is
 * present — from the `/demo/<Client>` path segment or the `?client=` fallback —
 * the share-link preview reflects it, so pasting the link into Slack / iMessage /
 * WhatsApp / socials unfurls as the client's own demo rather than a generic card.
 *
 * Kept noindex (these are shareable, not searchable) — unfurlers still read the
 * tags, so the preview title/description update regardless.
 */
/** Only pass through a real #hex colour to the OG image. */
function normalizeColor(raw?: string | null): string | null {
  const t = (raw ?? "").trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(t) ? t : null;
}

export function demoMetadata(rawName?: string | null, rawColor?: string | null): Metadata {
  const name = (rawName ?? "").trim();
  const title = name ? `${name} — live product demo` : "Foundry — live product demo";
  const description = name
    ? `${name}, running on sample data — a live, click-through demo. No login, nothing is saved.`
    : "Foundry by Gitwork, running on sample data — a live, click-through demo. No login, nothing is saved.";

  // Dynamic branded preview card (name + client colour). Relative URL — the root
  // layout's metadataBase resolves it to an absolute URL for unfurlers.
  const q = new URLSearchParams();
  if (name) q.set("name", name);
  const color = normalizeColor(rawColor);
  if (color) q.set("color", color);
  const ogImage = `/demo/og${q.toString() ? `?${q.toString()}` : ""}`;
  const images = [{ url: ogImage, width: 1200, height: 630, alt: title }];

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: "Foundry by Gitwork", images },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}
