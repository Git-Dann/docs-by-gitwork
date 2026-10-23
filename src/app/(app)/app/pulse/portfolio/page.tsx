import { AppShell } from "@/components/app-shell";
import { CodePortfolioView } from "@/components/pulse/code-portfolio";

export default function CodePortfolioPage() {
  return (
    <AppShell title="Code portfolio" subtitle="Every measured repository, and where the next days do the most good.">
      <CodePortfolioView />
    </AppShell>
  );
}
