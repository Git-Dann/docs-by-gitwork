import { AppShell } from "@/components/app-shell";
import { ClientSummaryBoardView } from "@/components/clients/client-summary-board";

/**
 * ⚠️ `summary` is a static segment and wins over `/app/portal/[slug]`, so a client
 * slugged "summary" would be unreachable. `RESERVED_CLIENT_SLUGS` refuses that name at
 * creation — see `server/clients.ts`.
 *
 * Gated by `/app/portal` in MODULE_PATHS (prefix matching is anchored on a segment
 * boundary), so no gate entry is needed and a scoped developer sees only their own
 * clients here, exactly as they do on Portal itself.
 */
export default function ClientSummaryPage() {
  return (
    <AppShell
      title="Client summary"
      subtitle="Every client on one board — what moved this week, what needs looking at."
    >
      <ClientSummaryBoardView />
    </AppShell>
  );
}
