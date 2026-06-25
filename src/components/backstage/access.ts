"use client";

import { useSession } from "next-auth/react";
import { isAtLeast, isSuperAdmin } from "@/types/auth";

// Single source of truth for Backstage access flags on the client. Mirrors the
// server-side checks in src/server/auth/effective-user.ts (Super Admins bypass).
export function useBackstageAccess() {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "STAFF";
  const permissions = (session?.user?.permissions as string[] | undefined) ?? [];
  const isAdmin = isAtLeast(role, "ADMIN");
  return {
    role,
    isAdmin,
    userId: session?.user?.id as string | undefined,
    /** Admin or HR (backstage.approve): can approve, file on behalf, edit anyone's leave. */
    canApprove: isAdmin || permissions.includes("backstage.approve"),
    /** Expenses are Super Admin only. */
    canManageExpenses: isSuperAdmin(role),
  };
}
