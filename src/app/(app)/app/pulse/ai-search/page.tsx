import { AppShell } from "@/components/app-shell";
import { InternalOnly } from "@/components/internal-only";
import { PulseNav } from "@/components/pulse/pulse-nav";
import { AiSearchView } from "@/components/pulse/ai-search";

/**
 * Pulse → AI search: how Gitwork shows up on Google and through AI assistants.
 *
 * ⚠️ About GITWORK, not the signed-in person, so it is internal-only twice over, like
 * Growth: `/app/pulse/ai-search` is in INTERNAL_ONLY_PREFIXES and the content sits inside
 * `InternalOnly`. The API refuses external roles too.
 */
export default function PulseAiSearchPage() {
  return (
    <AppShell title="AI search" subtitle="How buyers find Gitwork on Google and through AI assistants.">
      <PulseNav />
      <InternalOnly>
        <AiSearchView />
      </InternalOnly>
    </AppShell>
  );
}
