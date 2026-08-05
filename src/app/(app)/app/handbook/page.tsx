import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { HandbookLibrary } from "@/components/handbook/handbook-library";

export default function HandbookPage() {
  return (
    <AppShell title="Handbook">
      <Suspense fallback={null}>
        <HandbookLibrary />
      </Suspense>
    </AppShell>
  );
}
