import Link from "next/link";
import { ArrowLeftIcon, PlusIcon } from "@heroicons/react/24/outline";
import { AppShell } from "@/components/app-shell";
import { PulseScanListView } from "@/components/pulse/pulse-scan-list";
import { Button } from "@/components/ui/button";

export default function PulseAllScansPage() {
  return (
    <AppShell title="All scans" subtitle="Full history of Pulse validation runs.">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/app/pulse"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Pulse
          </Link>
          <Link href="/app/pulse/new">
            <Button variant="primary" size="sm" leadingIcon={<PlusIcon className="h-4 w-4" />}>
              New scan
            </Button>
          </Link>
        </div>
        <PulseScanListView />
      </div>
    </AppShell>
  );
}
