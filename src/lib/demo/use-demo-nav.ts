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

export function useDemoLinkReroute() {
  const router = useRouter();
  return function handleDemoNav(e: MouseEvent<HTMLElement>) {
    const anchor = (e.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    if (!href.startsWith("/app/")) return;
    e.preventDefault();
    const docMatch = href.match(/^\/app\/docs\/([^/?#]+)/);
    const devSignalMatch = href.match(/^\/app\/codeclear\/devsignal\/([^/?#]+)$/);
    if (devSignalMatch) router.push(`/demo/devsignal/${devSignalMatch[1]}`);
    else if (/^\/app\/codeclear\/devsignal$/.test(href)) router.push("/demo/devsignal");
    else if (/^\/app\/portal\/[^/]+\/wiki/.test(href)) router.push("/demo/wiki");
    else if (/^\/app\/portal\/[^/]+\/tasks/.test(href)) router.push("/demo/tasks");
    else if (/^\/app\/portal\/[^/]+$/.test(href)) router.push("/demo/portal");
    else if (docMatch && docMatch[1] !== "analytics")
      // Open on the Builder tab so the rich section content shows (not the empty Overview summary).
      router.push(`/demo/docs/${docMatch[1]}?tab=builder`);
    // else: swallow — don't leave the demo into the gated app.
  };
}
