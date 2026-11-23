import { Suspense } from "react";
import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { NeedsYouInbox } from "@/components/needs-you/needs-you-inbox";

export const metadata: Metadata = {
  title: "Foundry — Inbox demo",
  robots: { index: false, follow: false },
};

/** The real "Needs you" inbox (/app/inbox) on invented items; every action works in memory. */
export default function DemoInboxPage() {
  return (
    <DemoShell active="Foundry HQ" title="Inbox" subtitle="Everything that needs you, from every part of Foundry">
      <Suspense fallback={null}>
        <NeedsYouInbox />
      </Suspense>
    </DemoShell>
  );
}
