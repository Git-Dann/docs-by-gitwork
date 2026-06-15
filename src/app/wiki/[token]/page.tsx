import { notFound } from "next/navigation";
import { resolvePublicWiki } from "@/server/wiki";
import type { Metadata } from "next";
import Link from "next/link";
import { WikiPublicView } from "@/components/clients/wiki/wiki-public-view";

const SECTION_LABELS: Record<string, string> = {
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
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const resolved = await resolvePublicWiki(token);
  if (!resolved) return { title: "Not found" };
  const suffix = resolved.onlySection
    ? ` — ${SECTION_LABELS[resolved.onlySection] ?? "Wiki"}`
    : " — Wiki";
  return {
    title: `${resolved.wiki.clientName}${suffix}`,
    robots: { index: false },
  };
}

export default async function PublicWikiPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolvePublicWiki(token);
  if (!resolved) notFound();
  const { wiki, onlySection } = resolved;

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      {/* Header */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-white px-4 py-4 md:px-8">
        <div className="flex items-center justify-between">
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {wiki.clientName}{" // Wiki"}
            </p>
          </div>
          <p className="text-xs text-[var(--text-4)]">Powered by Gitwork</p>
        </div>
      </div>

      <WikiPublicView wiki={wiki} onlySection={onlySection} token={token} />

      {/* Footer */}
      <div className="mt-16 border-t border-[rgba(0,0,0,0.08)] bg-white px-4 py-6 md:px-8">
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
      </div>
    </div>
  );
}
