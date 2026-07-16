import { AppShell } from "@/components/app-shell";
import { MissionWall } from "@/components/mission/mission-wall";

// Exec "Mission Control" wall view (for the Corsair Xeneon Edge / any big screen).
// Reuses the real On Your Desk (DeskToday) in the centre; client health + quick actions
// around it. Logged-in page, so all data comes from the user's own session — no tokens.
export default function MissionControlPage() {
  return (
    <AppShell title="Mission Control" subtitle="Your desk, project health, and quick actions — one screen.">
      <MissionWall />
    </AppShell>
  );
}
