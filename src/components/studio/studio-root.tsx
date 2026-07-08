"use client";

// Studio root — owns the mode toggle (Social ⇄ App Screenshots) and switches between the two
// workspaces. Both modes share the shell chrome, the export pipeline (export.ts) and the shared
// control primitives (studio-ui.tsx); only their config/state/templates differ. The chosen mode
// persists to localStorage. Admin/Super-Admin gated at the route/nav/middleware layer.

import { PhotoIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { ScreenshotsWorkspace } from "./screenshots/screenshots-workspace";
import { StudioWorkspace } from "./studio-workspace";

type Mode = "social" | "screenshots";
const MODE_KEY = "gitwork.studio.mode.v1";

export function StudioRoot() {
  const [mode, setMode] = useState<Mode>("social");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(MODE_KEY) : null;
    if (raw === "social" || raw === "screenshots") setMode(raw);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) {
      try {
        window.localStorage.setItem(MODE_KEY, mode);
      } catch {
        /* ignore */
      }
    }
  }, [mode, hydrated]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-1 self-start rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
        <ModeButton active={mode === "social"} onClick={() => setMode("social")} icon={<Squares2X2Icon className="h-4 w-4" />} label="Social" />
        <ModeButton active={mode === "screenshots"} onClick={() => setMode("screenshots")} icon={<PhotoIcon className="h-4 w-4" />} label="App Screenshots" />
      </div>
      <div className="min-h-0 flex-1">{mode === "social" ? <StudioWorkspace /> : <ScreenshotsWorkspace />}</div>
    </div>
  );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition " +
        (active ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm" : "text-[var(--text-3)] hover:text-[var(--text-1)]")
      }
    >
      {icon}
      {label}
    </button>
  );
}
