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
    // DevSignal vetting pipeline — admin-only feature perm (default-off).
    canManageDevSignal: can("devsignal"),
    // Editing scoring weights + calibration is Super Admin only.
    canCalibrateDevSignal: isSuperAdmin(role),
    canManageDocs: can("docs.manage"),
    canShareDocs: can("docs.share"),
    canManageClients: can("clients.manage"),
    canShareClientTimeline: can("clients.shareTimeline"),
    canViewPulse: can("pulse"),
    // Assay: holding the module is a read-only register. Striking or withdrawing a Hallmark
    // is a separate high-risk action, because the issuer's name goes on a certificate a
    // client, insurer or acquirer relies on.
    canViewAssay: can("assay"),
    canIssueHallmark: can("assay.issue"),
    canViewSupport: can("support"),
    canManageSupport: can("support.manage"),
    // Study is an optional tool under Pulse, gated by the admin-only `study` feature perm
    // (default-off). View and manage collapse to one gate — Admins/Super Admins only.
    canManageStudy: can("study"),
    // Starters is Super-Admin-ONLY (Foundry-internal tools; the GitHub repo just stores the
    // sources). Role-gated, not a grantable feature perm — so Admins don't get it either.
    canManageStarters: isSuperAdmin(role),
    // Analytics ("GA4 for Foundry") is Super-Admin-ONLY — cross-workspace delivery, output and
    // AI-usage insight. Role-gated, not a grantable feature perm (like Curator / Starters).
    canViewAnalytics: isSuperAdmin(role),
    // Handbook (internal developer knowledgebase): everyone reads it, but only Admin + Super Admin
    // create/edit/delete. Developers and staff NEVER write to it (role-gated, not grantable).
    canManageHandbook: isAtLeast(role, "ADMIN"),
    // May TRIGGER fresh AI generation (spends tokens): Docs authoring, Care drafts + report
    // narratives, meeting/Slack summaries, Pulse scans + discovery. Admin/Super Admin by default;
    // grantable per person via `ai.generate`. Non-holders read cached AI output only. Use this to
    // hide/disable AI trigger buttons so non-holders don't hit a 403 wall. NB: fetching Scribe
    // meeting notes is exempt — it stays available to everyone regardless of this flag.
    canGenerateAi: isAtLeast(role, "ADMIN") || permissions.includes("ai.generate"),
  };
}
