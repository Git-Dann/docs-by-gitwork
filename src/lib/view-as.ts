"use client";

import { useState, useEffect, useCallback } from "react";

// null = your real Super Admin role (no override)
// "ADMIN_USER" = previewing as a specific named admin with their real permissions
// "STAFF" / "DEVELOPER" = preset role previews
export type ViewAsRole = "ADMIN_USER" | "STAFF" | "DEVELOPER" | null;

const ROLE_KEY = "foundry_view_as_role";
const USER_KEY = "foundry_view_as_user"; // JSON: { name, permissions }

// Preset permissions for Staff and Developer roles
export const VIEW_AS_PERMISSIONS: Record<"STAFF" | "DEVELOPER", string[]> = {
  STAFF: ["pulse", "codeclear", "study", "support", "clients", "proposals", "backstage"],
  DEVELOPER: ["backstage", "clients"],
};

export function useViewAs(isAdmin: boolean) {
  const [viewAs, setViewAsState] = useState<ViewAsRole>(null);
  const [viewAsUser, setViewAsUserState] = useState<{ name: string; permissions: string[] } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      const storedRole = localStorage.getItem(ROLE_KEY) as ViewAsRole;
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedRole === "STAFF" || storedRole === "DEVELOPER") {
        setViewAsState(storedRole);
      } else if (storedRole === "ADMIN_USER" && storedUser) {
        setViewAsState("ADMIN_USER");
        setViewAsUserState(JSON.parse(storedUser) as { name: string; permissions: string[] });
      }
    } catch {
      // ignore
    }
  }, [isAdmin]);

  // Preview as a specific admin user using their real permissions
  const setViewAsUser = useCallback((name: string, permissions: string[]) => {
    setViewAsState("ADMIN_USER");
    setViewAsUserState({ name, permissions });
    try {
      localStorage.setItem(ROLE_KEY, "ADMIN_USER");
      localStorage.setItem(USER_KEY, JSON.stringify({ name, permissions }));
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
    viewAs === "ADMIN_USER" ? (viewAsUser?.permissions ?? [])
    : viewAs === "STAFF" ? VIEW_AS_PERMISSIONS.STAFF
    : viewAs === "DEVELOPER" ? VIEW_AS_PERMISSIONS.DEVELOPER
    : null;

  const previewLabel =
    viewAs === "ADMIN_USER" ? `Admin (${viewAsUser?.name ?? "?"})` :
    viewAs === "STAFF" ? "Staff" :
    viewAs === "DEVELOPER" ? "Developer" : null;

  return { viewAs, viewAsUser, setViewAs, setViewAsUser, effectivePermissions, previewLabel };
}
