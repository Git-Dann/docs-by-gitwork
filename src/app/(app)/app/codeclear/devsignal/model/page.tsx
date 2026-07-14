import { AppShell } from "@/components/app-shell";
import { CodeClearTabs } from "@/components/codeclear/codeclear-shared";
import { DevSignalSubNav } from "@/components/codeclear/devsignal/devsignal-subnav";
import { ModelCockpit } from "@/components/codeclear/devsignal/model-cockpit";

export default function DevSignalModelPage() {
  return (
    <AppShell title="Code" subtitle="DevSignal scoring model — weights + calibration against real outcomes.">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <CodeClearTabs />
        </div>
        <DevSignalSubNav />
        <ModelCockpit />
      </div>
    </AppShell>
  );
}
