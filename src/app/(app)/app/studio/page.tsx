import { AppShell } from "@/components/app-shell";
import { StudioRoot } from "@/components/studio/studio-root";

export default function StudioPage() {
  return (
    <AppShell
      title="Studio"
      subtitle="Design on-brand social assets and App Store / Play Store screenshots — then batch-export at the exact size each platform needs."
    >
      <StudioRoot />
    </AppShell>
  );
}
