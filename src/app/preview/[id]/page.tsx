/**
 * Legacy ID-gated public preview — DEPRECATED.
 *
 * The route used to serve `/preview/{documentId}` to anyone who had the ID. As of Sprint 1 of the
 * Docs rebuild, documents are exposed via tokenised links at `/docs/[token]` only. To prevent
 * silent leaks via cached/copied URLs, this page now returns a clear "link expired" notice and
 * points the viewer at gitwork.io. The Foundry team can mint a fresh share token from the
 * proposal editor.
 *
 * Keep this file in place (rather than deleting the route) so old links 200 with a helpful
 * message rather than 404'ing with nothing.
 */

import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "Link expired — Gitwork",
  robots: { index: false, follow: false },
};

export default function LegacyPreviewLanding() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center gap-6 px-4 text-center sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/foundry-logo.png" alt="Foundry by Gitwork" className="h-8 w-auto" />

        <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--brand-700)]">
          00 // LINK EXPIRED
        </p>

        <h1 className="font-[family-name:var(--font-display)] text-[36px] font-normal leading-[1.15] tracking-[-0.5px] text-[var(--text-1)] sm:text-[44px]">
          This document link is <em>no longer active.</em>
        </h1>

        <p className="max-w-md text-sm leading-7 text-[var(--text-3)]">
          Gitwork rotated to tokenised share links to keep documents secure. If you were expecting
          to see a document here, please ask your Gitwork contact for a fresh link.
        </p>

        <Link
          href="https://gitwork.io"
          className="app-button app-button-secondary app-button-md inline-flex"
        >
          Visit gitwork.io
        </Link>
      </div>
    </main>
  );
}
