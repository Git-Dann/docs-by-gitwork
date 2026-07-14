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
export function demoMetadata(rawName?: string | null): Metadata {
  const name = (rawName ?? "").trim();
  const title = name ? `${name} — live product demo` : "Foundry — live product demo";
  const description = name
    ? `${name}, running on sample data — a live, click-through demo. No login, nothing is saved.`
    : "Foundry by Gitwork, running on sample data — a live, click-through demo. No login, nothing is saved.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: "Foundry by Gitwork" },
    twitter: { card: "summary", title, description },
  };
}
