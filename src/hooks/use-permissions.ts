"use client";

// Client-side permission checks for UI gating (hiding fields/sections). Backed by
// useAccount, which reads the DB-resolved permission set from /api/account — so UI
// gating stays consistent with the server-side field gates (no stale-JWT skew).
//
// IMPORTANT: this is cosmetic. The server is always authoritative — gated data is
// blanked in the API response regardless of what the client renders.

import { useAccount } from "@/hooks/use-account";
import { isSuperAdmin } from "@/types/auth";

export function usePermissions() {
  const { data, isPending } = useAccount();
  const role = data?.role ?? "";
  const permissions = data?.permissions ?? [];
  const can = (id: string) => isSuperAdmin(role) || permissions.includes(id);

  return {
    role,
    isPending,
    can,
    // Field gates
    canViewRates: can("code.viewRates"),
    canViewCosts: can("docs.viewCosts"),
    canViewRateCard: can("rateCard.view"),
    // Action gates (view vs manage + high-risk)
    canRunFixAgent: can("pulse.fixAgent"),
    canManageCode: can("code.manage"),
    canManageDocs: can("docs.manage"),
    canShareDocs: can("docs.share"),
    canManageClients: can("clients.manage"),
    canShareClientTimeline: can("clients.shareTimeline"),
    canManageSupport: can("support.manage"),
    canManageStudy: can("study.manage"),
  };
}
