import { AppShell } from "@/components/app-shell";
import { CodeClearTabs } from "@/components/codeclear/codeclear-shared";
import { StaffRoster } from "@/components/staff/staff-roster";

export const dynamic = "force-dynamic";

/** Staff → People (CLAUDE.md §87). Replaces Code as the module's landing page. */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return (
    <AppShell title="Staff" subtitle="Everyone on the team: roles, departments and the clients they're on.">
      <div className="space-y-5">
        <CodeClearTabs />
        <StaffRoster initialView={view === "archived" ? "archived" : "active"} />
      </div>
    </AppShell>
  );
}
