"use client";

// Client-side permission checks for UI gating (hiding fields/sections). Backed by
// useAccount, which reads the DB-resolved permission set from /api/account — so UI
// gating stays consistent with the server-side field gates (no stale-JWT skew).
//
// IMPORTANT: this is cosmetic. The server is always authoritative — gated data is
// blanked in the API response regardless of what the client renders.

import { useAccount } from "@/hooks/use-account";
import { isAtLeast, isSuperAdmin } from "@/types/auth";

export function usePermissions() {
  const { data, isPending } = useAccount();
  const role = data?.role ?? "";
  const permissions = data?.permissions ?? [];
  const showDevRates = data?.showDevRates ?? false;
  const can = (id: string) => isSuperAdmin(role) || permissions.includes(id);

  return {
    role,
    isPending,
    can,
    // Role tier checks — used by gates that don't fit a single permission
    // (e.g. moving devs between Bench / Off Bench, which is admin+ only).
    isAdminOrAbove: isAtLeast(role, "ADMIN"),
    isSuperAdmin: isSuperAdmin(role),
    // Field gates — rate/financial fields also respect the workspace showDevRates toggle
    // (Settings → General → Developer rates) so admins can hide them for demos.
    canViewRates: can("code.viewRates") && showDevRates,
    canViewCosts: can("docs.viewCosts"),
    canViewRateCard: can("rateCard.view") && showDevRates,
    canViewClientFinancials: can("clients.viewFinancials") && showDevRates,
    // Off → Docs is scoped to the lightweight types (no proposals/contracts). Default off for devs.
    canViewAdminDocTypes: can("docs.viewAdminTypes"),
    // Action gates (view vs manage + high-risk)
    canRunFixAgent: can("pulse.fixAgent"),
    canManageCode: can("code.manage"),
    canManageDocs: can("docs.manage"),
    canShareDocs: can("docs.share"),
    canManageClients: can("clients.manage"),
    canShareClientTimeline: can("clients.shareTimeline"),
    canManageSupport: can("support.manage"),
    // Study is an optional tool under Pulse, gated by the admin-only `study` feature perm
    // (default-off). View and manage collapse to one gate — Admins/Super Admins only.
    canManageStudy: can("study"),
  };
}
