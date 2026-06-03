import { AppShell } from "@/components/app-shell";
import { DesignSystemWorkspace } from "@/components/clients/design-system/design-system-workspace";

export default async function ClientDesignSystemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AppShell title="Design System" subtitle="The client’s brand tokens, rendered live.">
      <DesignSystemWorkspace slug={slug} />
    </AppShell>
  );
}
