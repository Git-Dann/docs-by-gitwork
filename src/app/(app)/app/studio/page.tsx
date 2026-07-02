import { AppShell } from "@/components/app-shell";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

export default function StudioPage() {
  return (
    <AppShell
      title="Studio"
      subtitle="Design on-brand social assets — carousels, banners, posts and avatars — then batch-export for every platform."
    >
      <StudioWorkspace />
    </AppShell>
  );
}
