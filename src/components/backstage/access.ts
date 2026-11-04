"use client";

import { useSession } from "next-auth/react";
import { useViewAs } from "@/lib/view-as";
import { isAtLeast, isSuperAdmin } from "@/types/auth";

// Single source of truth for Backstage access flags on the client. Mirrors the
// server-side checks in src/server/auth/effective-user.ts (Super Admins bypass).
//
// Follows "view as": previewing as someone shows their Backstage, not yours. It read the
// real session only, so a Super Admin previewing as Siân saw Expenses and Handover she
// doesn't have (Nov 2026). Cosmetic, like every client gate: the server decides.
export function useBackstageAccess() {
  const { data: session } = useSession();
  const realRole = session?.user?.role ?? "STAFF";
  const realPermissions = (session?.user?.permissions as string[] | undefined) ?? [];
  const { viewAs, viewAsUser, effectivePermissions } = useViewAs(isAtLeast(realRole, "ADMIN"));
  const previewing = effectivePermissions !== null;
  const role = previewing ? (viewAs === "USER" ? viewAsUser?.role ?? "STAFF" : viewAs ?? "STAFF") : realRole;
  const permissions = previewing ? effectivePermissions : realPermissions;
  const isAdmin = isAtLeast(role, "ADMIN");
  return {
    role,
    isAdmin,
    userId: session?.user?.id as string | undefined,
    /** Admin or HR (backstage.approve): can approve, file on behalf, edit anyone's leave. */
    canApprove: isAdmin || permissions.includes("backstage.approve"),
    /** Expenses: Super Admins, plus anyone granted `backstage.expenses` (see effective-user.ts). */
    canManageExpenses: isSuperAdmin(role) || permissions.includes("backstage.expenses"),
  };
}
