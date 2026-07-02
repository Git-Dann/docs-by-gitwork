import { notFound } from "next/navigation";
import { getPublicDesignSystem } from "@/server/design-system";
import { DesignSystemViewer } from "@/components/clients/design-system/design-system-viewer";
import { GuidelinesDeck } from "@/components/clients/design-system/guidelines-deck";

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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  const ds = await getPublicDesignSystem(token);
  if (!ds) notFound();

  // The branded deck is only served when the client has opted in.
  const showDeck = (await searchParams)?.view === "guidelines" && ds.guidelinesEnabled;

  return (
    <main className="min-h-[100dvh] bg-[#FAFAF9] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        {showDeck ? (
          <GuidelinesDeck
            tokens={ds.tokens}
            clientLogoUrl={ds.logoUrl}
            showFoundryBranding={ds.showFoundryBranding}
          />
        ) : (
          <DesignSystemViewer
            tokens={ds.tokens}
            clientLogoUrl={ds.logoUrl}
            showFoundryBranding={ds.showFoundryBranding}
          />
        )}
      </div>
    </main>
  );
}
