import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { SuppliersPanel } from "@/components/staff/suppliers";

export const metadata: Metadata = {
  title: "Foundry — Suppliers demo",
  robots: { index: false, follow: false },
};

/** Demo of Staff → Suppliers (docs/hr-platform.md). No auth, no database. */
export default function DemoStaffSuppliersPage() {
  return (
    <DemoShell active="Staff" title="Staff" subtitle="The companies that supply people to the team.">
      <SuppliersPanel />
    </DemoShell>
  );
}
