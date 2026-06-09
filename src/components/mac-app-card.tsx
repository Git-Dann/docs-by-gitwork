"use client";

// Super-Admin-only Mac app download card for the sidebar footer.
// Always visible (unlike AiSpendCard which hides until configured) — it's a permanent
// entry point for the team to grab the latest Foundry Mac build.
//
// Version number is driven by /desktop/latest-mac.json so every deploy of that file
// auto-updates the badge here. No manual bump needed in code.
//
// Follows DESIGN.md — mono eyebrow, hairline border card, no shadow.

import { usePermissions } from "@/hooks/use-permissions";
import { isSuperAdmin } from "@/types/auth";
import { ArrowDownTrayIcon, ComputerDesktopIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

interface MacManifest {
  version: string;
  build: string;
  dmgUrl: string;
  notarized: boolean;
}

function useMacManifest() {
  const [data, setData] = useState<MacManifest | null>(null);

  useEffect(() => {
    fetch("/desktop/latest-mac.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: MacManifest | null) => { if (json) setData(json); })
      .catch(() => {/* silent — no placeholder states */});
  }, []);

  return data;
}

export function MacAppCard() {
  const { role } = usePermissions();
  const isSuper = isSuperAdmin(role);
  const manifest = useMacManifest();

  if (!isSuper) return null;

  return (
    <div className="mb-2 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2.5">
      {/* Eyebrow */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Foundry for Mac
        </span>
        {manifest && (
          <span
            className="text-[10px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            v{manifest.version}
          </span>
        )}
      </div>

      {/* Download row */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ComputerDesktopIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
          <span className="text-xs text-[var(--text-3)]">
            {manifest ? `Build ${manifest.build}` : "macOS 26+"}
          </span>
        </div>

        <a
          href={manifest?.dmgUrl ?? "/download"}
          className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--surface-brand)] px-2 py-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--brand-100)] hover:text-[var(--brand-800)]"
        >
          <ArrowDownTrayIcon className="h-3 w-3" />
          Download
        </a>
      </div>
    </div>
  );
}
