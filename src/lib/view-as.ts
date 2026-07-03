"use client";

import { useState, useEffect, useCallback } from "react";

// null = your real Super Admin role (no override)
// "USER" = previewing as a specific named teammate (admin/staff/dev) with their real permissions
// "STAFF" / "DEVELOPER" = preset role previews
export type ViewAsRole = "USER" | "STAFF" | "DEVELOPER" | null;

export type ViewAsUser = { name: string; permissions: string[]; role?: string };

const ROLE_KEY = "foundry_view_as_role";
const USER_KEY = "foundry_view_as_user"; // JSON: { name, permissions }

// Preset permissions for Staff and Developer roles
export const VIEW_AS_PERMISSIONS: Record<"STAFF" | "DEVELOPER", string[]> = {
  STAFF: ["pulse", "codeclear", "support", "clients", "proposals", "backstage"],
  DEVELOPER: ["backstage", "clients"],
};

// Human-friendly label for the previewed teammate's stored role
function roleLabel(role?: string): string {
  switch (role) {
    case "DEVELOPER": return "Developer";
    case "STAFF": return "Staff";
    case "SUPER_ADMIN": return "Super Admin";
    case "ADMIN": return "Admin";
    default: return "Admin"; // legacy USER previews were admins-only
  }
}

export function useViewAs(isAdmin: boolean) {
  const [viewAs, setViewAsState] = useState<ViewAsRole>(null);
  const [viewAsUser, setViewAsUserState] = useState<ViewAsUser | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      const storedRole = localStorage.getItem(ROLE_KEY);
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedRole === "STAFF" || storedRole === "DEVELOPER") {
        setViewAsState(storedRole);
        // "ADMIN_USER" is the legacy value for what's now "USER" — honour both.
      } else if ((storedRole === "USER" || storedRole === "ADMIN_USER") && storedUser) {
        setViewAsState("USER");
        setViewAsUserState(JSON.parse(storedUser) as ViewAsUser);
      }
    } catch {
      // ignore
    }
  }, [isAdmin]);

  // Preview as a specific teammate (admin, staff or developer) using their real permissions
  const setViewAsUser = useCallback((name: string, permissions: string[], role?: string) => {
    const user: ViewAsUser = { name, permissions, role };
    setViewAsState("USER");
    setViewAsUserState(user);
    try {
      localStorage.setItem(ROLE_KEY, "USER");
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch { /* ignore */ }
    window.location.reload();
  }, []);

  // Preview as a preset role (Staff / Developer) or clear back to Super Admin
  const setViewAs = useCallback((role: "STAFF" | "DEVELOPER" | null) => {
    setViewAsState(role);
    setViewAsUserState(null);
    try {
      if (role) {
        localStorage.setItem(ROLE_KEY, role);
        localStorage.removeItem(USER_KEY);
      } else {
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(USER_KEY);
      }
    } catch { /* ignore */ }
    window.location.reload();
  }, []);

  // The effective permissions to use — null means "use real role" (Super Admin = full access)
  const effectivePermissions: string[] | null =
    viewAs === "USER" ? (viewAsUser?.permissions ?? [])
    : viewAs === "STAFF" ? VIEW_AS_PERMISSIONS.STAFF
    : viewAs === "DEVELOPER" ? VIEW_AS_PERMISSIONS.DEVELOPER
    : null;

  const previewLabel =
    viewAs === "USER"
      ? `${roleLabel(viewAsUser?.role)} (${viewAsUser?.name ?? "?"})`
      : viewAs === "STAFF" ? "Staff"
      : viewAs === "DEVELOPER" ? "Developer" : null;

  return { viewAs, viewAsUser, setViewAs, setViewAsUser, effectivePermissions, previewLabel };
}
