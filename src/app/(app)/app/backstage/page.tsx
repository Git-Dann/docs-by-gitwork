import { AppShell } from "@/components/app-shell";
import { BackstageWorkspace } from "@/components/backstage/backstage-workspace";

export default function BackstagePage() {
  return (
    <AppShell
      title="Backstage"
      subtitle="Internal team ops — leave, public holidays and team availability."
    >
      <BackstageWorkspace />
    </AppShell>
  );
}
