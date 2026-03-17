import { AppShell } from "@/components/app-shell";
import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      subtitle="Workspace defaults, snippets, and future brand/theme configuration foundation."
    >
      <SettingsPanel />
    </AppShell>
  );
}
