import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { StaffProfileView } from "@/components/staff/staff-profile";

export const metadata: Metadata = {
  title: "Foundry — Staff profile demo",
  robots: { index: false, follow: false },
};

/** Demo of a Staff profile (docs/hr-platform.md), seen as HR. No auth, no database. */
export default async function DemoStaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DemoShell active="Staff" title="Staff" subtitle="A person's record: overview, employment and personal details.">
      <StaffProfileView recordId={id} basePath="/demo/staff" />
    </DemoShell>
  );
}
