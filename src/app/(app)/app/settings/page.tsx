import { AppShell } from "@/components/app-shell";
import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      subtitle="Proposal defaults, branding, confidentiality, and reusable snippets."
    >
      <SettingsPanel />
    </AppShell>
  );
}
