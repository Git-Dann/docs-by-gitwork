import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { NeedsYouInbox } from "@/components/needs-you/needs-you-inbox";

/**
 * The "Needs you" inbox (§151). No module permission of its own: every source inside is gated
 * and scoped by /api/hq/needs-you exactly as its own page is, so a person only ever sees what
 * they could open anyway. Internal only (INTERNAL_ONLY_PREFIXES in module-gate.ts).
 */
export default function InboxPage() {
  return (
    <AppShell title="Inbox" subtitle="Everything that needs you, from every part of Foundry">
      <Suspense fallback={null}>
        <NeedsYouInbox />
      </Suspense>
    </AppShell>
  );
}
