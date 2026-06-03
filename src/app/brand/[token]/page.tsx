import { notFound } from "next/navigation";
import { getPublicDesignSystem } from "@/server/design-system";
import { DesignSystemViewer } from "@/components/clients/design-system/design-system-viewer";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ds = await getPublicDesignSystem(token);
  return {
    title: ds ? `${ds.clientName} — Design system` : "Design system",
    robots: { index: false, follow: false },
  };
}

export default async function PublicBrandPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ds = await getPublicDesignSystem(token);
  if (!ds) notFound();

  return (
    <main className="min-h-[100dvh] bg-[#FAFAF9] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <DesignSystemViewer tokens={ds.tokens} />
        <footer className="mt-8 flex items-center justify-center gap-1.5 text-xs text-[var(--text-4)]">
          <span style={{ fontFamily: "var(--font-mono), monospace" }}>
            Updated {formatDate(ds.generatedAt)}
          </span>
          <span aria-hidden>·</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/foundry-logo.svg" alt="" className="h-4 w-auto opacity-60" />
          <span>Powered by Gitwork</span>
        </footer>
      </div>
    </main>
  );
}
