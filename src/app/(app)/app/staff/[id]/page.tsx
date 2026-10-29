import { AppShell } from "@/components/app-shell";
import { StaffProfileView } from "@/components/staff/staff-profile";

export const dynamic = "force-dynamic";

/** Staff → a person's profile (docs/hr-platform.md). Access is decided per card on the server. */
export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell title="Staff" subtitle="A person's record: overview, employment and personal details.">
      <StaffProfileView recordId={id} />
    </AppShell>
  );
}
