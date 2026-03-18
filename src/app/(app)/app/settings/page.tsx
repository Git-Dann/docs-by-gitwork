import { AppShell } from "@/components/app-shell";
import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <AppShell
      title="Account settings"
      subtitle="Profile, workspace defaults, confidentiality copy, and invited users."
    >
      <SettingsPanel />
    </AppShell>
  );
}
