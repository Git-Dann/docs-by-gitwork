import { AppShell } from "@/components/app-shell";
import { ClientDetail } from "@/components/clients/client-detail";

export default async function PortalClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AppShell title="Client">
      <ClientDetail slug={slug} />
    </AppShell>
  );
}
