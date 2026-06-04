"use client";

import { useState, useEffect, useCallback } from "react";

export type ViewAsRole = "ADMIN" | "STAFF" | "DEVELOPER" | null;

const STORAGE_KEY = "foundry_view_as_role";

// Preset permissions that match what each role actually gets
export const VIEW_AS_PERMISSIONS: Record<NonNullable<ViewAsRole>, string[]> = {
  // Admin sees everything — same as Super Admin in practice, useful for UI verification
  ADMIN: ["pulse", "codeclear", "study", "support", "clients", "proposals", "backstage"],
  STAFF: ["pulse", "codeclear", "study", "support", "clients", "proposals", "backstage"],
  DEVELOPER: ["backstage", "clients"],
};

export const VIEW_AS_OPTIONS: Array<{ role: ViewAsRole; label: string; description: string }> = [
  { role: null,        label: "Super Admin (you)", description: "Full platform access — your real role" },
  { role: "ADMIN",     label: "Admin",             description: "Full access, no owner privileges" },
  { role: "STAFF",     label: "Staff",             description: "All modules, no admin tools" },
  { role: "DEVELOPER", label: "Developer",         description: "Task board + assigned clients only" },
];

export function useViewAs(isAdmin: boolean) {
  const [viewAs, setViewAsState] = useState<ViewAsRole>(null);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ViewAsRole;
      if (stored === "ADMIN" || stored === "STAFF" || stored === "DEVELOPER") setViewAsState(stored);
    } catch {
      // ignore
    }
  }, [isAdmin]);

  const setViewAs = useCallback((role: ViewAsRole) => {
    setViewAsState(role);
    try {
      if (role) localStorage.setItem(STORAGE_KEY, role);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  }, []);

  return { viewAs, setViewAs };
}
