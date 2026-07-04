import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { StarterDetail } from "@/components/starters/starter-detail";

export default async function StarterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell title="Starter">
      <Suspense fallback={null}>
        <StarterDetail starterId={id} />
      </Suspense>
    </AppShell>
  );
}
