"use client";

/**
 * Shared click interceptor for the demo. The reused production components hardcode
 * real `/app/*` links (client "Wiki →" pill, wiki back-link, "Tasks →", doc cards)
 * which are auth-gated and would bounce to /login. This reroutes the ones the demo
 * covers to their /demo equivalents and swallows any other /app link so the demo
 * never leaves into the gated app. Used by DemoShell (chrome pages) + DemoProviders
 * (full-screen pages like the wiki).
 */

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

/**
 * Where a real `/app/*` link goes in the demo, or `null` when the demo has no
 * equivalent (the caller swallows those, so the demo never leaves into the gated
 * app). Pure, so Gitwork OS (`/demo/os`) can open the same targets in a window
 * instead of navigating.
 */
export function demoHrefFor(href: string): string | null {
  if (!href.startsWith("/app/")) return null;
  const docMatch = href.match(/^\/app\/docs\/([^/?#]+)/);
  const devSignalMatch = href.match(/^\/app\/(?:staff\/hiring|codeclear)\/devsignal\/([^/?#]+)$/);
  const pulseScanMatch = href.match(/^\/app\/pulse\/([^/?#]+)/);
  const pulseProjectMatch = href.match(/^\/app\/pulse\/projects\/([^/?#]+)/);
  const pulseCompareMatch = href.match(/^\/app\/pulse\/compare(\?.*)?$/);
  // The embed settings page has no demo; its home in the nav is Growth.
  if (/^\/app\/pulse\/embed(\?.*)?$/.test(href)) return "/demo/pulse/growth";
  if (pulseProjectMatch) return `/demo/pulse/projects/${pulseProjectMatch[1]}`;
  if (pulseCompareMatch) return `/demo/pulse/compare${pulseCompareMatch[1] ?? ""}`;
  if (devSignalMatch) return `/demo/devsignal/${devSignalMatch[1]}`;
  if (/^\/app\/(?:staff\/hiring|codeclear)\/devsignal$/.test(href)) return "/demo/devsignal";
  if (/^\/app\/pulse\/new/.test(href) || /^\/app\/pulse$/.test(href)) return "/demo/pulse";
  if (pulseScanMatch) return `/demo/pulse/${pulseScanMatch[1]}`;
  if (/^\/app\/portal\/[^/]+\/wiki/.test(href)) return "/demo/wiki";
  if (/^\/app\/portal\/[^/]+\/tasks/.test(href)) return "/demo/tasks";
  if (/^\/app\/portal\/[^/]+$/.test(href)) return "/demo/portal";
  // Open on the Builder tab so the rich section content shows (not the empty Overview summary).
  if (docMatch && docMatch[1] !== "analytics") return `/demo/docs/${docMatch[1]}?tab=builder`;
  return null;
}

export function useDemoLinkReroute() {
  const router = useRouter();
  return function handleDemoNav(e: MouseEvent<HTMLElement>) {
    const anchor = (e.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    if (!href.startsWith("/app/")) return;
    e.preventDefault();
    const target = demoHrefFor(href);
    if (target) router.push(target);
    // else: swallow — don't leave the demo into the gated app.
  };
}
