import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { StarterList } from "@/components/starters/starter-list";

export default function StartersPage() {
  return (
    <AppShell
      title="Starters"
      subtitle="Gitwork's Prompt→Production library — reusable prompts, skills, plugins and kits."
    >
      <Suspense fallback={null}>
        <StarterList />
      </Suspense>
    </AppShell>
  );
}
