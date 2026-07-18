import { AppShell } from "@/components/app-shell";
import { StarterRecipesPanel } from "@/components/starters/starter-recipes-panel";

export default function StarterRecipesPage() {
  return (
    <AppShell
      title="Recipes"
      subtitle="Curated bundles of existing Starters — the whole stack for a kind of project, in one click."
    >
      <StarterRecipesPanel />
    </AppShell>
  );
}
