import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { findSessionMembership } from "@/server/auth/home-membership";
import { isSuperAdmin } from "@/types/auth";
import { AppShell } from "@/components/app-shell";
import { MoneyWorkspace } from "@/components/money/money-workspace";

export const dynamic = "force-dynamic";

/**
 * Money: Super Admins and people granted `clients.viewFinancials` (e.g. Siân). Read live from the
 * membership, not the token, so revoking the grant takes effect at once. Anyone else gets a 404.
 */
export default async function MoneyPage() {
  const session = await auth();
  const member = await findSessionMembership(session?.user);
  const role = member?.role ?? "";
  const perms = Array.isArray(member?.permissions) ? (member.permissions as unknown[]) : [];
  if (!isSuperAdmin(role) && !perms.includes("clients.viewFinancials")) notFound();

  return (
    <AppShell title="Money" subtitle="Revenue under contract, what's still to bill, and what's in the pipeline.">
      <MoneyWorkspace />
    </AppShell>
  );
}
