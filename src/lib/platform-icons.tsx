/**
 * platform-icons.tsx
 *
 * Which mark a platform or design card shows, from its URL (then its type).
 *
 * Brand marks are the OFFICIAL ones from Simple Icons (`simple-icons`, CC0, pinned in
 * package.json; licence in docs/third-party-ui.md), which carries each brand's own SVG and hex.
 * Never redraw a logo as hand-made SVG paths (Dan's rule, Nov 2026). A brand Simple Icons does not
 * carry (Slack, Amazon, TestFlight, Featurebase …) falls back to a generic outline icon: we never
 * invent one.
 *
 * Colour: the brand's own hex where it reads on BOTH themes' surfaces (≥3:1 against
 * light --surface-1 and dark --surface-1); otherwise the mark is drawn in its mono variant
 * (currentColor, --text-1), which every one of these brands permits. Proportions are untouched.
 *
 * Hosts match exactly or as a subdomain, never as a substring, so `figma.com.evil.test` is not
 * Figma (the same rule as src/lib/wiki-sheet-media.ts).
 */

import type { ComponentType } from "react";
import {
  ChartBarIcon,
  CodeBracketIcon,
  CogIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  ShoppingBagIcon,
  TvIcon,
} from "@heroicons/react/24/outline";
import {
  siAirtable,
  siApple,
  siAppstore,
  siBitbucket,
  siClickup,
  siCloudflare,
  siDigitalocean,
  siDropbox,
  siExpo,
  siFigma,
  siFirebase,
  siFramer,
  siGithub,
  siGitlab,
  siGoogleanalytics,
  siGooglecloud,
  siGoogledocs,
  siGoogledrive,
  siGoogleplay,
  siGooglesheets,
  siJira,
  siLinear,
  siLoom,
  siMiro,
  siMixpanel,
  siNetlify,
  siNotion,
  siPosthog,
  siRailway,
  siRender,
  siSentry,
  siShopify,
  siSquarespace,
  siStripe,
  siSupabase,
  siTrello,
  siVercel,
  siWebflow,
  siWix,
  siWordpress,
  siYoutube,
  type SimpleIcon,
} from "simple-icons";

export type PlatformMarkInfo =
  | { kind: "brand"; icon: SimpleIcon; label: string; fill: string | null }
  | { kind: "generic"; icon: ComponentType<{ className?: string }>; label: string };

/** [hosts (exact or subdomain), icon, label override?]. First match wins, so specific hosts lead. */
const BY_HOST: Array<[string[], SimpleIcon, string?]> = [
  [["apps.apple.com", "itunes.apple.com"], siAppstore],
  // TestFlight is not in Simple Icons; Apple's own mark stands for Apple's service.
  [["testflight.apple.com"], siApple, "TestFlight"],
  [["play.google.com"], siGoogleplay],
  [["analytics.google.com"], siGoogleanalytics],
  [["console.cloud.google.com", "cloud.google.com"], siGooglecloud],
  [["drive.google.com"], siGoogledrive],
  [["firebase.google.com", "firebaseapp.com", "web.app"], siFirebase],
  [["github.com", "github.io"], siGithub],
  [["gitlab.com"], siGitlab],
  [["bitbucket.org"], siBitbucket],
  [["figma.com"], siFigma],
  [["miro.com"], siMiro],
  [["vercel.app", "vercel.com"], siVercel],
  [["netlify.app", "netlify.com"], siNetlify],
  [["supabase.co", "supabase.com"], siSupabase],
  [["wordpress.com", "wordpress.org"], siWordpress],
  [["webflow.io", "webflow.com"], siWebflow],
  [["myshopify.com", "shopify.com"], siShopify],
  [["squarespace.com"], siSquarespace],
  [["wixsite.com", "wix.com"], siWix],
  [["framer.app", "framer.website", "framer.com"], siFramer],
  [["notion.so", "notion.site"], siNotion],
  [["linear.app"], siLinear],
  [["clickup.com"], siClickup],
  [["atlassian.net"], siJira],
  [["trello.com"], siTrello],
  [["stripe.com"], siStripe],
  [["mixpanel.com"], siMixpanel],
  [["posthog.com"], siPosthog],
  [["sentry.io"], siSentry],
  [["cloudflare.com"], siCloudflare],
  [["digitalocean.com"], siDigitalocean],
  [["railway.app", "railway.com"], siRailway],
  [["render.com", "onrender.com"], siRender],
  [["expo.dev"], siExpo],
  [["loom.com"], siLoom],
  [["youtube.com", "youtu.be"], siYoutube],
  [["airtable.com"], siAirtable],
  [["dropbox.com"], siDropbox],
];

function hostOf(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function hostMatches(host: string, candidate: string): boolean {
  return host === candidate || host.endsWith(`.${candidate}`);
}

// ─── Colour: brand hex only where it reads on both themes ───────────────────

const LIGHT_GROUND = [0xf5, 0xf5, 0xf4]; // --surface-1, light
const DARK_GROUND = [0x1e, 0x1e, 0x20]; // --surface-1, dark
const MIN_CONTRAST = 3; // WCAG 1.4.11, non-text graphics

function luminance([r, g, b]: number[]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hexToRgb(hex: string): number[] {
  const h = hex.replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** The brand's own colour when it reads on both themes' grounds; null means draw the mono mark. */
export function brandFill(hex: string): string | null {
  const rgb = hexToRgb(hex);
  return contrastRatio(rgb, LIGHT_GROUND) >= MIN_CONTRAST && contrastRatio(rgb, DARK_GROUND) >= MIN_CONTRAST ? `#${hex}` : null;
}

function brand(icon: SimpleIcon, label?: string): PlatformMarkInfo {
  return { kind: "brand", icon, label: label ?? icon.title, fill: brandFill(icon.hex) };
}

function generic(icon: ComponentType<{ className?: string }>, label: string): PlatformMarkInfo {
  return { kind: "generic", icon, label };
}

/**
 * Detect the mark for a platform or design card. The URL decides first (most specific), then the
 * platform's type, then a globe.
 */
export function detectPlatformMark(url?: string | null, platformType?: string | null): PlatformMarkInfo {
  const host = hostOf(url);
  if (host) {
    if (host === "docs.google.com") {
      return (url ?? "").includes("/spreadsheets/") ? brand(siGooglesheets) : brand(siGoogledocs);
    }
    for (const [hosts, icon, label] of BY_HOST) {
      if (hosts.some((c) => hostMatches(host, c))) return brand(icon, label);
    }
    // Amazon asked Simple Icons to remove its marks, so there is no official one to use.
    if (["amazon.com", "amazon.co.uk", "amzn.to"].some((c) => hostMatches(host, c))) {
      return generic(ShoppingBagIcon, "Amazon");
    }
  }

  const pt = (platformType ?? "").trim().toUpperCase();
  if (pt === "IOS APP STORE" || pt === "IOS" || pt === "APP STORE") return brand(siAppstore);
  if (pt === "GOOGLE PLAY" || pt === "ANDROID" || pt === "PLAY STORE") return brand(siGoogleplay);
  if (pt === "WORDPRESS") return brand(siWordpress);
  if (pt === "AMAZON FIRE TV" || pt === "FIRETV" || pt === "FIRE TV") return generic(TvIcon, "Amazon Fire TV");
  if (pt === "ANALYTICS" || pt === "ANALYTICS PLATFORM") return generic(ChartBarIcon, "Analytics");
  if (pt.includes("API")) return generic(CodeBracketIcon, "API");
  if (pt === "ADMIN_PANEL" || pt === "ADMIN PANEL" || pt === "ADMIN") return generic(CogIcon, "Admin");
  if (pt === "MOBILE_APP" || pt === "MOBILE APP" || pt === "MOBILE") return generic(DevicePhoneMobileIcon, "Mobile");

  return generic(GlobeAltIcon, "Website");
}

/**
 * The mark on a neutral tile. A brand mark is the official SVG at its own proportions; a generic
 * one is a grey outline icon. The tile is a token, so it follows light and dark.
 */
export function PlatformMark({
  url,
  platformType,
  className,
  size = "md",
}: {
  url?: string | null;
  platformType?: string | null;
  className?: string;
  /** md: the 36px tile on a row; lg: a 56px tile, for a design shown as a large card. */
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  const mark = detectPlatformMark(url, platformType);
  return (
    <span
      className={[
        lg ? "h-14 w-14 rounded-[12px]" : "h-9 w-9 rounded-[8px]",
        "flex shrink-0 items-center justify-center border border-[var(--border-3)] bg-[var(--surface-1)]",
        className ?? "",
      ].join(" ")}
      title={mark.label}
    >
      {mark.kind === "brand" ? (
        <svg
          viewBox="0 0 24 24"
          width={lg ? 28 : 18}
          height={lg ? 28 : 18}
          role="img"
          aria-label={mark.label}
          className={mark.fill ? undefined : "text-[var(--text-1)]"}
        >
          <path d={mark.icon.path} fill={mark.fill ?? "currentColor"} />
        </svg>
      ) : (
        <GenericMark icon={mark.icon} label={mark.label} large={lg} />
      )}
    </span>
  );
}

function GenericMark({ icon: Icon, label, large }: { icon: ComponentType<{ className?: string }>; label: string; large?: boolean }) {
  return (
    <>
      <Icon className={large ? "h-7 w-7 text-[var(--text-3)]" : "h-[18px] w-[18px] text-[var(--text-3)]"} />
      <span className="sr-only">{label}</span>
    </>
  );
}
