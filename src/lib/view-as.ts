"use client";

import { useState, useEffect, useCallback } from "react";

export type ViewAsRole = "STAFF" | "DEVELOPER" | null;

const STORAGE_KEY = "foundry_view_as_role";

// Preset permissions that match what each role actually gets
export const VIEW_AS_PERMISSIONS: Record<NonNullable<ViewAsRole>, string[]> = {
  STAFF: ["pulse", "codeclear", "study", "support", "clients", "proposals", "backstage"],
  DEVELOPER: ["backstage", "clients"],
};

export function useViewAs(isAdmin: boolean) {
  const [viewAs, setViewAsState] = useState<ViewAsRole>(null);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ViewAsRole;
      if (stored === "STAFF" || stored === "DEVELOPER") setViewAsState(stored);
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
    // Reload so all server-rendered parts reflect the new preview state
    window.location.reload();
  }, []);

  return { viewAs, setViewAs };
}
