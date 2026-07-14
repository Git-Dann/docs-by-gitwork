import { AppShell } from "@/components/app-shell";
import { CodeClearTabs } from "@/components/codeclear/codeclear-shared";
import { DevSignalSubNav } from "@/components/codeclear/devsignal/devsignal-subnav";
import { NoticeEditor } from "@/components/codeclear/devsignal/notice-editor";

export default function DevSignalNoticePage() {
  return (
    <AppShell title="Code" subtitle="DevSignal consent notice — the candidate-facing GDPR copy.">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <CodeClearTabs />
        </div>
        <DevSignalSubNav />
        <NoticeEditor />
      </div>
    </AppShell>
  );
}
