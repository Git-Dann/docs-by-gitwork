/**
 * platform-icons.tsx
 *
 * URL / platformType detection → icon + colour pair for platform and design cards.
 * All brand icons are self-contained inline SVGs — no external icon library needed.
 */

import type { ReactNode } from "react";
import {
  ChartBarIcon,
  CodeBracketIcon,
  CogIcon,
  GlobeAltIcon,
  ShoppingBagIcon,
  DevicePhoneMobileIcon,
  RectangleGroupIcon,
} from "@heroicons/react/24/outline";

export interface PlatformIconInfo {
  icon: ReactNode;
  label: string;
  /** Foreground colour for the icon */
  color: string;
  /** Background tint for the icon badge */
  bg: string;
}

// ─── Inline brand SVGs ───────────────────────────────────────────────────────

function AppleSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.38.07 2.33.75 3.13.8.97-.13 1.93-.84 3.13-.9 1.81-.09 3.17.66 4.04 1.89-3.43 1.96-2.55 6.63.58 8.01-.64 1.72-1.43 3.41-2.88 4.08ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z"/>
    </svg>
  );
}

function GooglePlaySvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path d="M3.18 23.76c.3.17.63.24.97.21l12.5-11.47L13.22 9 3.18 23.76ZM22.03 10.37 18.7 8.43l-3.87 3.57 3.88 3.57 3.35-1.96A2 2 0 0 0 22.03 10.37ZM2.12.36A1.99 1.99 0 0 0 2 1.16v21.68a2 2 0 0 0 .12.79L13.22 12 2.12.36Zm9.75 11.14 3.35-3.08L2.73.2A1.97 1.97 0 0 0 1.94 0c-.29 0-.58.07-.84.21L11.87 11.5Z"/>
    </svg>
  );
}

function AmazonSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path d="M13.96 11.26c-.61.3-1.31.5-2.02.5-1.13 0-2.19-.44-2.99-1.24A4.23 4.23 0 0 1 7.7 7.5c0-1.13.44-2.19 1.25-2.99a4.23 4.23 0 0 1 3-.24A4.24 4.24 0 0 1 15.7 7.5c0 .7-.17 1.38-.5 1.97l2.38 2.37.14-.13a8.52 8.52 0 0 0 0-12.05A8.5 8.5 0 0 0 5.66 11.7C3.62 13.04 2 15.28 2 17.93c0 1.05.29 2.03.77 2.87C4.6 21.85 7.35 23 11.33 23c3.22 0 5.84-.83 7.95-2.52L22 23l.76-.76-2.6-3.08C22.05 17.48 22 15.63 22 14c0-.6-.04-1.18-.12-1.74l-2.05-2.05c.08.43.12.87.12 1.3 0 1.92-.74 3.68-2.06 5l-.78-.78A6.44 6.44 0 0 0 18.7 12c0-1.73-.67-3.35-1.9-4.57a6.46 6.46 0 0 0-4.57-1.89c-.55 0-1.09.07-1.6.2l1.33 1.52z"/>
      <path d="M.76 18.55C2.9 21.32 6.32 23 11.33 23c2.72 0 5.1-.59 7.1-1.73l-1.5-1.77c-1.62.86-3.49 1.35-5.6 1.35-4.09 0-7.1-1.52-9.06-3.87l-1.51.57z"/>
    </svg>
  );
}

function GitHubSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.1.83-.25.83-.56l-.01-2.18c-3.34.72-4.04-1.42-4.04-1.42-.55-1.38-1.33-1.75-1.33-1.75-1.08-.74.08-.72.08-.72 1.2.08 1.83 1.23 1.83 1.23 1.06 1.82 2.8 1.3 3.48.98.1-.76.41-1.3.75-1.6-2.66-.3-5.47-1.33-5.47-5.92 0-1.3.47-2.37 1.24-3.21-.13-.3-.54-1.52.12-3.16 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.66 1.64.25 2.86.12 3.16.77.84 1.24 1.9 1.24 3.2 0 4.61-2.81 5.62-5.49 5.92.43.37.82 1.1.82 2.23l-.01 3.3c0 .31.22.67.83.56A12 12 0 0 0 12 .3"/>
    </svg>
  );
}

function FigmaSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path d="M8 24c2.2 0 4-1.8 4-4v-4H8a4 4 0 0 0 0 8ZM4 12a4 4 0 0 0 4 4h4v-8H8a4 4 0 0 0-4 4ZM4 4a4 4 0 0 0 4 4h4V0H8a4 4 0 0 0-4 4ZM16 8a4 4 0 0 0 0-8h-4v8h4ZM12 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z"/>
    </svg>
  );
}

function VercelSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path d="M24 22.525H0l12-21.05 12 21.05z"/>
    </svg>
  );
}

function NotionSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path d="M4.46 2.31c.78.64 1.07.59 2.54.49l13.8-.82c.29 0 .05-.29-.05-.34L18.47.62c-.34-.24-.78-.54-1.61-.49L3.3 1.04c-.48.05-.58.29-.39.49l1.55 1.78ZM5.1 5.03v14.5c0 .78.39 1.07 1.27 1.02l15.17-.87c.88-.05.97-.63.97-1.27V3.98c0-.63-.24-1.02-.78-.97l-15.65.9c-.59.05-.98.44-.98 1.12ZM19.44 5.6c.1.44 0 .88-.44.93l-.73.15v10.7c-.63.34-1.22.54-1.71.54-.78 0-.97-.24-1.56-.97l-4.78-7.52v7.27l1.51.34s0 .88-1.22.88l-3.37.2c-.1-.2 0-.68.34-.78l.88-.24V8.38L6.9 8.27c-.1-.44.14-1.07.78-1.12l3.61-.24 4.97 7.62V7.65l-1.27-.15c-.1-.54.29-.93.78-.97l3.66-.2ZM2.01 1.37l13.9-.98c1.71-.14 2.15-.05 3.22.73l4.44 3.12c.73.54.97.68.97 1.27v16.57c0 1.07-.39 1.7-1.76 1.76l-16.1.97C5.34 24.9 4.8 24.7 4.16 24L.84 20.14C.11 19.31 0 18.78 0 18.1V3.08C0 2.11.44 1.47 2.01 1.37Z"/>
    </svg>
  );
}

function LinearSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path d="M2.28 10.56 13.44 21.72A10 10 0 0 1 2.28 10.56ZM1 13.66a10 10 0 0 0 9.34 9.34L1 13.66ZM2.82 7.05l14.13 14.13a10.12 10.12 0 0 0 2.74-2.05L4.87 4.31A10.12 10.12 0 0 0 2.82 7.05ZM7.05 2.82l14.13 14.13A10 10 0 0 0 7.05 2.82ZM10.56 2.28A10 10 0 0 1 21.72 13.44L10.56 2.28Z"/>
    </svg>
  );
}

// ─── Detection logic ──────────────────────────────────────────────────────────

/**
 * Detect the appropriate icon + colour for a platform or design card.
 * URL patterns are checked first (most specific), then platformType as a fallback.
 */
export function detectPlatformIcon(
  url?: string | null,
  platformType?: string | null,
): PlatformIconInfo {
  const u = (url ?? "").toLowerCase();

  // ── URL-based detection ──────────────────────────────────────────────────
  if (u.includes("apps.apple.com") || u.includes("itunes.apple.com") || u.includes("testflight.apple.com")) {
    return { icon: <AppleSvg />, label: "App Store", color: "#1a1a1a", bg: "#f5f5f7" };
  }

  if (u.includes("play.google.com") || u.includes("market://")) {
    return { icon: <GooglePlaySvg />, label: "Google Play", color: "#34A853", bg: "#f0fdf4" };
  }

  if (
    u.includes("amazon.com") ||
    u.includes("amzn.to") ||
    u.includes("firetv") ||
    u.includes("appstore.amazon") ||
    u.includes("amazon.co.uk")
  ) {
    return { icon: <AmazonSvg />, label: "Amazon", color: "#c45500", bg: "#fff7ed" };
  }

  if (u.includes("github.com") || u.includes("github.io")) {
    return { icon: <GitHubSvg />, label: "GitHub", color: "#24292f", bg: "#f6f8fa" };
  }

  if (u.includes("figma.com")) {
    return { icon: <FigmaSvg />, label: "Figma", color: "#a259ff", bg: "#faf5ff" };
  }

  if (u.includes("vercel.app") || u.includes("vercel.com")) {
    return { icon: <VercelSvg />, label: "Vercel", color: "#000", bg: "#f8fafc" };
  }

  if (u.includes("notion.so") || u.includes("notion.site")) {
    return { icon: <NotionSvg />, label: "Notion", color: "#37352f", bg: "#f7f6f3" };
  }

  if (u.includes("linear.app")) {
    return { icon: <LinearSvg />, label: "Linear", color: "#5e6ad2", bg: "#eef0ff" };
  }

  if (u.includes("shopify.com") || u.includes("myshopify.com")) {
    return {
      icon: <ShoppingBagIcon className="h-[18px] w-[18px]" />,
      label: "Shopify",
      color: "#007b5e",
      bg: "#ecfdf5",
    };
  }

  if (u.includes("webflow.io") || u.includes("webflow.com")) {
    return {
      icon: <RectangleGroupIcon className="h-[18px] w-[18px]" />,
      label: "Webflow",
      color: "#146ef5",
      bg: "#eff6ff",
    };
  }

  // ── platformType-based detection (fallback) ──────────────────────────────
  const pt = (platformType ?? "").toUpperCase();

  if (pt === "ANALYTICS" || pt === "ANALYTICS PLATFORM") {
    return {
      icon: <ChartBarIcon className="h-[18px] w-[18px]" />,
      label: "Analytics",
      color: "#7c3aed",
      bg: "#f5f3ff",
    };
  }

  if (pt === "API" || pt.includes("API")) {
    return {
      icon: <CodeBracketIcon className="h-[18px] w-[18px]" />,
      label: "API",
      color: "#0891b2",
      bg: "#ecfeff",
    };
  }

  if (pt === "ADMIN_PANEL" || pt === "ADMIN PANEL" || pt === "ADMIN") {
    return {
      icon: <CogIcon className="h-[18px] w-[18px]" />,
      label: "Admin",
      color: "#64748b",
      bg: "#f8fafc",
    };
  }

  if (pt === "MOBILE_APP" || pt === "MOBILE APP" || pt === "MOBILE") {
    return {
      icon: <DevicePhoneMobileIcon className="h-[18px] w-[18px]" />,
      label: "Mobile",
      color: "#0f766e",
      bg: "#f0fdfa",
    };
  }

  // ── App store platform types (from platform form) ─────────────────────────
  if (pt === "IOS APP STORE" || pt === "IOS") {
    return { icon: <AppleSvg />, label: "App Store", color: "#1a1a1a", bg: "#f5f5f7" };
  }

  if (pt === "GOOGLE PLAY" || pt === "ANDROID") {
    return { icon: <GooglePlaySvg />, label: "Google Play", color: "#34A853", bg: "#f0fdf4" };
  }

  if (pt === "AMAZON FIRE TV" || pt === "FIRETV" || pt === "FIRE TV") {
    return { icon: <AmazonSvg />, label: "Amazon Fire TV", color: "#c45500", bg: "#fff7ed" };
  }

  // ── Default: globe ───────────────────────────────────────────────────────
  return {
    icon: <GlobeAltIcon className="h-[18px] w-[18px]" />,
    label: "Website",
    color: "#1D4ED8",
    bg: "#eff6ff",
  };
}
