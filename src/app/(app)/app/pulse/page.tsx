import Link from "next/link";
import { PlusIcon } from "@heroicons/react/24/outline";
import { AppShell } from "@/components/app-shell";
import { PulseOverview } from "@/components/pulse/pulse-overview";
import { PulseScanListView } from "@/components/pulse/pulse-scan-list";
import { Button } from "@/components/ui/button";

export default function PulsePage() {
  return (
    <AppShell
      title="Pulse"
      subtitle="Validate and audit client projects — from prompt to production."
    >
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div />
          <Link href="/app/pulse/new">
            <Button variant="primary" size="sm" leadingIcon={<PlusIcon className="h-4 w-4" />}>
              New scan
            </Button>
          </Link>
        </div>
        <PulseOverview />
        <PulseScanListView />
      </div>
    </AppShell>
  );
}
