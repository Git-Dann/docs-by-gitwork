import type { Metadata } from "next";
import { PortalLoginForm } from "@/components/portal/portal-login-form";
import { PortalFooter } from "@/components/public/portal-footer";

/**
 * This page is the public front door of the host — `/` redirects here — and because a
 * Pulse scan follows redirects, it is the page the scan actually grades. That is why it
 * carries a footer and real landmarks; see PortalFooter for the detail.
 *
 * `robots: index:false` is deliberate and stays. A login page ranking for the brand is
 * worse than nothing, and the crawl directives in robots.ts disallow it too. The
 * knock-on is that `meta_robots` remains a scan FAIL — an accepted trade, not an
 * oversight. Making it indexable to win one check would be the wrong call.
 */
export const metadata: Metadata = {
  title: "Client Portal — Sign in | Foundry by Gitwork",
  description:
    "Sign in to the Gitwork client portal to view your project timeline, documents and wiki.",
  robots: { index: false },
};

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only accept internal wiki paths as a post-login destination.
  const safeNext = next && next.startsWith("/wiki/") ? next : null;
  return (
    <>
      {/* Theme-lock the document itself to the cream so iOS Safari's overscroll /
          address-bar area matches the login (the app body is otherwise dark in
          OS dark mode, which showed as a "cropped" background). */}
      <style>{`html,body{background:#EDE8E1 !important;color-scheme:light;}`}</style>
      {/*
        <main> wraps the form for the landmark; the form sets its own 100dvh and stays
        centred in the first viewport exactly as designed, so the footer follows below
        it rather than competing for that space. Scrolling once past a centred login card
        to reach a footer is normal — and the alternative (changing the form's height)
        would risk the centring on mobile for no real gain.
      */}
      <main id="main-content">
        <PortalLoginForm next={safeNext} />
      </main>
      <PortalFooter />
    </>
  );
}
