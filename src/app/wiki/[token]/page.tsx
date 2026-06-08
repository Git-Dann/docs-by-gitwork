import { notFound } from "next/navigation";
import { getPublicWiki } from "@/server/wiki";
import type { Metadata } from "next";
import Link from "next/link";
import { WikiPublicView } from "@/components/clients/wiki/wiki-public-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const wiki = await getPublicWiki(token);
  if (!wiki) return { title: "Not found" };
  return {
    title: `${wiki.clientName} — Wiki`,
    robots: { index: false },
  };
}

export default async function PublicWikiPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const wiki = await getPublicWiki(token);
  if (!wiki) notFound();

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      {/* Header */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {wiki.clientName} // Wiki
            </p>
          </div>
          <p className="text-xs text-[var(--text-4)]">Powered by Gitwork</p>
        </div>
      </div>

      <WikiPublicView wiki={wiki} />

      {/* Footer */}
      <div className="mt-16 border-t border-[rgba(0,0,0,0.08)] bg-white px-8 py-6">
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
