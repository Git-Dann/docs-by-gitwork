import { AppShell } from "@/components/app-shell";
import { ClientManagement } from "@/components/clients/client-management";

export default function ClientsPage() {
  return (
    <AppShell
      title="Clients"
      subtitle="Manage client records and jump straight into the proposals attached to them."
    >
      <ClientManagement />
    </AppShell>
  );
}
