import { AppShell } from "@/components/app-shell";
import { AccountSettingsPanel } from "@/components/account-settings-panel";

export default function AccountSettingsPage() {
  return (
    <AppShell
      title="Account settings"
      subtitle="Profile image, identity details, password placeholder, and invited users."
    >
      <AccountSettingsPanel />
    </AppShell>
  );
}
