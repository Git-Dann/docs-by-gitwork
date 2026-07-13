"use client";

// Studio root — a client-brand picker + a mode toggle (Social ⇄ App Screenshots ⇄ App Icons).
// Selecting a client with a design system rebrands every mode (see brand.tsx). All modes share the
// shell chrome, the export pipeline (export.ts) and the shared control primitives (studio-ui.tsx).
// The chosen mode + client persist to localStorage. Admin/Super-Admin gated at the route layer.

import { DevicePhoneMobileIcon, PhotoIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { StudioBrandProvider, useStudioBrand } from "./brand";
import { IconsWorkspace } from "./icons/icons-workspace";
import { ScreenshotsWorkspace } from "./screenshots/screenshots-workspace";
import { StudioWorkspace } from "./studio-workspace";

type Mode = "social" | "screenshots" | "icons";
const MODE_KEY = "gitwork.studio.mode.v1";

export function StudioRoot() {
  return (
    <StudioBrandProvider>
      <StudioRootInner />
    </StudioBrandProvider>
  );
}

function StudioRootInner() {
  const [mode, setMode] = useState<Mode>("social");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(MODE_KEY) : null;
    if (raw === "social" || raw === "screenshots" || raw === "icons") setMode(raw);
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
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
          <ModeButton active={mode === "social"} onClick={() => setMode("social")} icon={<Squares2X2Icon className="h-4 w-4" />} label="Social" />
          <ModeButton active={mode === "screenshots"} onClick={() => setMode("screenshots")} icon={<PhotoIcon className="h-4 w-4" />} label="App Screenshots" />
          <ModeButton active={mode === "icons"} onClick={() => setMode("icons")} icon={<DevicePhoneMobileIcon className="h-4 w-4" />} label="App Icons" />
        </div>
        <ClientBrandPicker />
      </div>
      <div className="min-h-0 flex-1">{mode === "social" ? <StudioWorkspace /> : mode === "screenshots" ? <ScreenshotsWorkspace /> : <IconsWorkspace />}</div>
    </div>
  );
}

function ClientBrandPicker() {
  const { brand, clients, selectedSlug, setSelectedSlug, hasDesignSystem, loadingDs } = useStudioBrand();
  const noDs = selectedSlug && !hasDesignSystem && !loadingDs;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">Brand</span>
      <select
        className="app-select-compact min-w-[190px]"
        value={selectedSlug ?? ""}
        onChange={(e) => setSelectedSlug(e.target.value || null)}
      >
        <option value="">Gitwork (default)</option>
        {clients.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      {loadingDs ? (
        <span className="text-[11px] text-[var(--text-4)]">loading…</span>
      ) : brand.source === "client" ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-50)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand-700)]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brand.colors.primary }} />
          {brand.name} brand
        </span>
      ) : noDs ? (
        <span className="text-[11px] text-[var(--text-4)]">no design system — using Gitwork</span>
      ) : null}
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
