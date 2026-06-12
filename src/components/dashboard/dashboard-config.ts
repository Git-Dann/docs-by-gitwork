// Permission helpers shared across the HQ dashboard. The old ATTENTION_CARDS
// registry was collapsed into the unified <OnYourDeskCard> in src/components/
// dashboard/on-your-desk-card.tsx — the per-card components (ApprovalsCard,
// OverdueTasksCard, ProposalsSignoffCard) still live in this directory and
// can be reused as standalone admin views later.

import { isAtLeast } from "@/types/auth";

export type DashAccount = { role: string; permissions: string[] };

const isAdmin = (a: DashAccount) => isAtLeast(a.role, "ADMIN");

/** Admins/Super Admins bypass; everyone else needs the permission. */
export const can = (a: DashAccount, perm: string) => isAdmin(a) || a.permissions.includes(perm);
