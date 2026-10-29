import { AppShell } from "@/components/app-shell";
import { CodeClearTabs } from "@/components/codeclear/codeclear-shared";
import { SuppliersPanel } from "@/components/staff/suppliers";

export const dynamic = "force-dynamic";

/** Staff → Suppliers: the companies that supply people to the team (docs/hr-platform.md). */
export default function StaffSuppliersPage() {
  return (
    <AppShell title="Staff" subtitle="The companies that supply people to the team.">
      <div className="space-y-5">
        <CodeClearTabs />
        <SuppliersPanel />
      </div>
    </AppShell>
  );
}
