import { AppShell } from "@/components/app-shell";
import { ClientManagement } from "@/components/clients/client-management";

export default function PortalPage() {
  return (
    <AppShell
      title="Portal"
      subtitle="Manage client records and jump straight into the proposals attached to them."
    >
      <ClientManagement />
    </AppShell>
  );
}
