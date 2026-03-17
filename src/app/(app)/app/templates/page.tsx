import { AppShell } from "@/components/app-shell";
import { TemplateManagement } from "@/components/template-management";

export default function TemplatesPage() {
  return (
    <AppShell
      title="Templates"
      subtitle="Template-driven architecture foundation for proposals, SLAs, and future document types."
    >
      <TemplateManagement />
    </AppShell>
  );
}
