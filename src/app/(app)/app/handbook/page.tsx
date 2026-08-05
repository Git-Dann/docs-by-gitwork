import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { HandbookLibrary } from "@/components/handbook/handbook-library";
import { AttributionChip } from "@/components/handbook/attribution-chip";

export default function HandbookPage() {
  return (
    <AppShell title="Handbook" titleAccessory={<AttributionChip name="Umer Fayyaz" />}>
      <Suspense fallback={null}>
        <HandbookLibrary />
      </Suspense>
    </AppShell>
  );
}
