import { AppShell } from "@/components/app-shell";
import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      subtitle="Profile, proposal defaults, branding, confidentiality, and invited users."
    >
      <SettingsPanel />
    </AppShell>
  );
}
