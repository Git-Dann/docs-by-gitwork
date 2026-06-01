import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { PortalWorkspace } from "@/components/clients/portal-workspace";

export default function PortalPage() {
  return (
    <AppShell
      title="Portal"
      subtitle="Manage client records and the work in flight across them."
    >
      <Suspense fallback={null}>
        <PortalWorkspace />
      </Suspense>
    </AppShell>
  );
}
