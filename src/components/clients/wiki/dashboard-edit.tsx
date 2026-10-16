"use client";

/**
 * The dashboard's Edit mode — shared between the header button (beside the theme switcher)
 * and the dashboard itself.
 *
 * The two are rendered by different parents (the share page's server-rendered header vs the
 * client view below it; the workspace's top bar vs its content pane), so a tiny external
 * store is the honest shape: no prop has to be threaded through components that have no
 * business knowing about it.
 *
 * The button only renders while a dashboard is mounted — Edit means nothing on a Timeline
 * page — and leaving the dashboard ends edit mode.
 */

import { useSyncExternalStore } from "react";
import { CheckIcon, PencilSquareIcon } from "@heroicons/react/24/outline";

interface EditState {
  editing: boolean;
  dashboardMounted: boolean;
}

let state: EditState = { editing: false, dashboardMounted: false };
const listeners = new Set<() => void>();
const SERVER_STATE: EditState = { editing: false, dashboardMounted: false };

function set(next: Partial<EditState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export const dashboardEdit = {
  setEditing: (editing: boolean) => set({ editing }),
  /** Called by the dashboard on mount/unmount. Unmounting also leaves edit mode. */
  setMounted: (mounted: boolean) => set(mounted ? { dashboardMounted: true } : { dashboardMounted: false, editing: false }),
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDashboardEdit(): EditState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

/** Sits beside the theme switcher. Same height and border as that control. */
export function DashboardEditButton() {
  const { editing, dashboardMounted } = useDashboardEdit();
  if (!dashboardMounted) return null;
  return (
    <button
      type="button"
      onClick={() => dashboardEdit.setEditing(!editing)}
      aria-pressed={editing}
      className={`inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-[11px] uppercase tracking-[0.08em] transition-colors ${
        editing
          ? "border-[var(--brand-600)] bg-[var(--brand-600)] text-white"
          : "border-[var(--border-1)] bg-[var(--surface-0)] text-[var(--text-2)] hover:bg-[var(--surface-1)]"
      }`}
      style={{ fontFamily: "var(--font-mono), 'JetBrains Mono', monospace" }}
      title={editing ? "Finish arranging the dashboard" : "Arrange your dashboard"}
    >
      {editing ? <CheckIcon className="h-4 w-4" /> : <PencilSquareIcon className="h-4 w-4" />}
      {editing ? "Done" : "Edit"}
    </button>
  );
}
