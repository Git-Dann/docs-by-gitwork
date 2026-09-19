import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { MessagesWorkspace } from "@/components/messages/messages-workspace";

export default function MessagesPage() {
  return (
    <AppShell title="Messages" subtitle="Written and sent by a person, not by the system">
      <Suspense fallback={null}>
        <MessagesWorkspace />
      </Suspense>
    </AppShell>
  );
}
