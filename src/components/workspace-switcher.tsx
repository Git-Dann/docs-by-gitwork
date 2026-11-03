"use client";

/**
 * Switch business, for someone who is a member of more than one (multi-tenant Phase 3).
 * Renders nothing for everyone else, which today is almost everyone.
 */

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface WorkspaceOption {
  id: string;
  name: string;
  current: boolean;
}

export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { update } = useSession();
  const [switching, setSwitching] = useState(false);
  const { data } = useQuery({
    queryKey: ["account", "workspaces"],
    queryFn: async () => (await apiFetch<{ workspaces: WorkspaceOption[] }>("/api/account/workspaces")).workspaces,
    staleTime: 5 * 60 * 1000,
  });
  if (!data || data.length < 2 || collapsed) return null;
  const current = data.find((w) => w.current);

  return (
    <label className="block px-1">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">Business</span>
      <select
        className="app-select w-full text-sm"
        value={current?.id ?? ""}
        disabled={switching}
        aria-label="Switch business"
        onChange={async (e) => {
          setSwitching(true);
          await update({ workspaceId: e.target.value });
          // A full load, so every cached query is read again for the new business.
          window.location.assign("/app");
        }}
      >
        {data.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
