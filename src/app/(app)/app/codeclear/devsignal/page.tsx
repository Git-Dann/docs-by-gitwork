import { AppShell } from "@/components/app-shell";
import { CodeClearTabs } from "@/components/codeclear/codeclear-shared";
import { DevSignalQueue } from "@/components/codeclear/devsignal/devsignal-queue";

export default function DevSignalPage() {
  return (
    <AppShell
      title="Code"
      subtitle="Developer vetting — assess candidates, then promote the right ones into Code."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <CodeClearTabs />
        </div>
        <DevSignalQueue />
      </div>
    </AppShell>
  );
}
