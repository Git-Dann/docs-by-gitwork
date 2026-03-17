import { AppShell } from "@/components/app-shell";
import { ClientDetail } from "@/components/clients/client-detail";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AppShell
      title="Client"
      subtitle="Proposals and linked documents grouped under a single client record."
    >
      <ClientDetail slug={slug} />
    </AppShell>
  );
}
