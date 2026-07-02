import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolvePublicWiki } from "@/server/wiki";
import { verifyWikiAccessCookie, wikiAccessCookieName } from "@/server/wiki-access";
import { auth } from "@/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { WikiPublicView } from "@/components/clients/wiki/wiki-public-view";

// Session/cookie-dependent (the access lockdown) — render per request.
export const dynamic = "force-dynamic";

const SECTION_LABELS: Record<string, string> = {
  timeline: "Timeline",
  "system-status": "System Status",
  monitors: "Monitors",
  "design-system": "Design System",
  ia: "Information Architecture",
  "dev-guide": "Developer Guide",
  "api-docs": "API Docs",
  architecture: "Architecture",
  runbook: "Runbook",
  "data-model": "Data Model",
  changelog: "Changelog",
  "course-requests": "Course Requests",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const resolved = await resolvePublicWiki(token);
  if (!resolved) return { title: "Not found" };
  const { clientName } = resolved.wiki;
  const sectionLabel = resolved.onlySection
    ? SECTION_LABELS[resolved.onlySection] ?? "Wiki"
    : null;
  const title = `${clientName}${sectionLabel ? ` — ${sectionLabel}` : " — Wiki"}`;
  // Client-relative description so the social unfurl reflects this wiki, not the
  // generic Foundry site copy from the root layout.
  const description = sectionLabel
    ? `${clientName}'s ${sectionLabel}, shared from their knowledge wiki.`
    : `${clientName}'s knowledge wiki — project timeline, documentation, changelog and updates.`;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description },
  };
}

export default async function PublicWikiPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { slug, token } = await params;
  const { section } = await searchParams;
  const resolved = await resolvePublicWiki(token);
  if (!resolved) notFound();

  // The token is the source of truth; canonicalise the readable slug in the URL
  // (forgiving of a stale or wrong slug — e.g. after a client rename).
  if (resolved.wiki.clientSlug !== slug) {
    redirect(`/wiki/${resolved.wiki.clientSlug}/${token}`);
  }

  const { wiki, onlySection } = resolved;

  // Hard lockdown: the public wiki is viewable only by (a) a logged-in
  // Gitwork/Foundry staff member, or (b) an authenticated client user with a
  // valid access cookie. Anyone else is sent to the central client portal login,
  // which authenticates by email and routes back here (?next).
  const session = await auth();
  const isStaff = Boolean(session?.user?.id);
  if (!isStaff) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(wikiAccessCookieName(wiki.id))?.value;
    const unlocked = await verifyWikiAccessCookie(wiki.id, cookieValue);
    if (!unlocked) {
      redirect(`/portal/login?next=${encodeURIComponent(`/wiki/${slug}/${token}`)}`);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-0)]">
      {/* Header — branding lives once, in the footer. */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-white px-4 py-4 md:px-8">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {wiki.clientName}{" // Wiki"}
        </p>
      </header>

      {/* Content grows to fill the viewport so the footer stays pinned to the bottom
          AND the sidebar divider spans the full height (flex-col → child stretches). */}
      <main className="flex flex-1 flex-col">
        <WikiPublicView
          wiki={wiki}
          onlySection={onlySection}
          initialSection={section ?? null}
          token={token}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-[rgba(0,0,0,0.08)] bg-white px-4 py-6 md:px-8">
        <div className="flex items-center justify-between text-xs text-[var(--text-4)]">
          <span>
            {wiki.clientName} · Knowledge Wiki
          </span>
          <Link
            href="https://gitwork.co.uk"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--text-2)] transition"
          >
            Powered by Gitwork
          </Link>
        </div>
      </footer>
    </div>
  );
}
