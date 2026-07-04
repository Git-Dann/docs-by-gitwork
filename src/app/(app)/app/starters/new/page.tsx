import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { StarterForm } from "@/components/starters/starter-form";

export default function NewStarterPage() {
  return (
    <AppShell title="New Starter" subtitle="Add a Gitwork building block to the library.">
      <Suspense fallback={null}>
        <StarterForm />
      </Suspense>
    </AppShell>
  );
}
