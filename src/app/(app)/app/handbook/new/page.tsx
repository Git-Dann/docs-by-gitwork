import { AppShell } from "@/components/app-shell";
import { HandbookForm } from "@/components/handbook/handbook-form";

export default function NewHandbookArticlePage() {
  return (
    <AppShell title="New article" subtitle="Add a page to the developer handbook.">
      <HandbookForm />
    </AppShell>
  );
}
