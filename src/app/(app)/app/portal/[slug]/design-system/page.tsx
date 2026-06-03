import { AppShell } from "@/components/app-shell";
import { DesignSystemWorkspace } from "@/components/clients/design-system/design-system-workspace";

export default async function ClientDesignSystemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AppShell title="Design System">
      <DesignSystemWorkspace slug={slug} />
    </AppShell>
  );
}
