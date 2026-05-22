import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/foundry/module-placeholder";

export default function PortalPage() {
  return (
    <AppShell
      title="Portal"
      subtitle="Client-facing project visibility with controlled access to docs, blockers, approvals, and support."
    >
      <ModulePlaceholder
        moduleName="Portal"
        eyebrow="Client workspace"
        summary="Portal should read from the same project, document, approval, and support objects as the internal suite, with explicit permission controls layered on top."
        nextSteps={[
          "Add a client-safe project summary derived from the HQ project object.",
          "Add document visibility rules before exposing generated docs externally.",
          "Separate internal-only blockers from blockers that require client action.",
        ]}
      />
    </AppShell>
  );
}
