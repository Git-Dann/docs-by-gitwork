import { AppShell } from "@/components/app-shell";
import { ClientManagement } from "@/components/clients/client-management";

export default function PortalPage() {
  return (
    <AppShell
      title="Portal"
      subtitle="Manage client records and the work in flight across them."
    >
      <ClientManagement />
    </AppShell>
  );
}
