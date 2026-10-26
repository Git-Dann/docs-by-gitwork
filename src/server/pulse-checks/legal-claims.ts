// The EU Digital Markets Act binds only the gatekeepers the European Commission has
// designated, for their designated core platform services. Every other site is out of
// scope, so a "no DMA reference" warning on it was a finding about a law that cannot apply.
//
// Designations as of October 2026: Alphabet, Amazon, Apple, ByteDance, Meta, Microsoft
// (September 2023) and Booking (May 2024). Review when the Commission designates another.

const GATEKEEPER_DOMAINS = [
  // Alphabet: Search, Maps, Play, Shopping, YouTube, Android, Chrome
  "google.com", "youtube.com", "android.com",
  // Amazon: marketplace, advertising
  "amazon.com",
  // Apple: App Store, iOS, iPadOS, Safari
  "apple.com",
  // ByteDance: TikTok
  "tiktok.com",
  // Meta: Facebook, Instagram, WhatsApp, Messenger, Marketplace
  "facebook.com", "instagram.com", "whatsapp.com", "messenger.com", "meta.com",
  // Microsoft: Windows, LinkedIn
  "microsoft.com", "windows.com", "linkedin.com",
  // Booking: Booking.com
  "booking.com",
];

/** Country-code storefronts of the same services (google.de, amazon.co.uk). */
const GATEKEEPER_CC = /(?:^|\.)(?:google|amazon)\.(?:[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;

/** True when the host is one of a designated gatekeeper's own services. */
export function isDmaGatekeeperHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (GATEKEEPER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  return GATEKEEPER_CC.test(host);
}
