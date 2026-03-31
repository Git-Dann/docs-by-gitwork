import { AppShell } from "@/components/app-shell";
import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  const apiKeyConfigured = Boolean(process.env.API_KEY ?? process.env.NEXT_PUBLIC_API_KEY);

  return (
    <AppShell
      title="Settings"
      subtitle="Proposal defaults, branding, people and rates, confidentiality, and API access."
    >
      <SettingsPanel apiKeyConfigured={apiKeyConfigured} />
    </AppShell>
  );
}
