import { AppShell } from "@/components/app-shell";
import { CodeClearTabs } from "@/components/codeclear/codeclear-shared";
import { ChallengeBank } from "@/components/codeclear/devsignal/challenge-bank";
import { DevSignalSubNav } from "@/components/codeclear/devsignal/devsignal-subnav";

export default function DevSignalChallengesPage() {
  return (
    <AppShell
      title="Code"
      subtitle="DevSignal challenge bank — the coding tasks candidates are assessed on."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <CodeClearTabs />
        </div>
        <DevSignalSubNav />
        <ChallengeBank />
      </div>
    </AppShell>
  );
}
