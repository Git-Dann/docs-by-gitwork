"use client";

// Studio root — a client-brand picker + a mode toggle (Social ⇄ App Screenshots ⇄ App Icons).
// Selecting a client with a design system rebrands every mode (see brand.tsx). All modes share the
// shell chrome, the export pipeline (export.ts) and the shared control primitives (studio-ui.tsx).
// The chosen mode + client persist to localStorage. Admin/Super-Admin gated at the route layer.

import { BanknotesIcon, DevicePhoneMobileIcon, PhotoIcon, PresentationChartBarIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { StudioBrandProvider, useStudioBrand } from "./brand";
import { CostingWorkspace } from "./costing/costing-workspace";
import { DemoConfigurator } from "./demo-builder";
import { IconsWorkspace } from "./icons/icons-workspace";
import { ScreenshotsWorkspace } from "./screenshots/screenshots-workspace";
import { StudioWorkspace } from "./studio-workspace";

type Mode = "social" | "screenshots" | "icons" | "costing" | "demo";
const MODE_KEY = "gitwork.studio.mode.v1";
const MODES: Mode[] = ["social", "screenshots", "icons", "costing", "demo"];

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
  const { isSuperAdmin } = usePermissions();

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(MODE_KEY) : null;
    if (raw && (MODES as string[]).includes(raw)) setMode(raw as Mode);
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
          <ModeButton active={mode === "demo"} onClick={() => setMode("demo")} icon={<PresentationChartBarIcon className="h-4 w-4" />} label="Demo builder" />
          {isSuperAdmin ? (
            <ModeButton active={mode === "costing"} onClick={() => setMode("costing")} icon={<BanknotesIcon className="h-4 w-4" />} label="Costing" />
          ) : null}
        </div>
        {mode === "costing" || mode === "demo" ? null : <ClientBrandPicker />}
      </div>
      <div className="min-h-0 flex-1">
        {mode === "demo" ? (
          <div className="h-full min-h-0 overflow-auto">
            <DemoConfigurator />
          </div>
        ) : mode === "costing" ? (
          isSuperAdmin ? (
            <CostingWorkspace />
          ) : (
            <StudioWorkspace />
          )
        ) : mode === "social" ? (
          <StudioWorkspace />
        ) : mode === "screenshots" ? (
          <ScreenshotsWorkspace />
        ) : (
          <IconsWorkspace />
        )}
      </div>
    </div>
  );
}

function ClientBrandPicker() {
  const { brand, clients, selectedSlug, setSelectedSlug } = useStudioBrand();
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">Brand</span>
      <div className="relative">
        {brand.source === "client" ? (
          <span className="pointer-events-none absolute left-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ backgroundColor: brand.colors.primary }} />
        ) : null}
        <select
          className={"app-select-compact min-w-[190px] " + (brand.source === "client" ? "pl-6" : "")}
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
      </div>
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
