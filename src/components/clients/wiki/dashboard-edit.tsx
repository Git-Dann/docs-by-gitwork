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

/**
 * Sits beside the theme switcher and is built from the SAME parts — the bordered well with
 * 2px padding, a 6px inner button, 14px icon, text-xs — so the two read as one row of
 * controls rather than two different components side by side.
 */
export function DashboardEditButton() {
  const { editing, dashboardMounted } = useDashboardEdit();
  if (!dashboardMounted) return null;
  return (
    <div className="inline-flex items-center rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
      <button
        type="button"
        onClick={() => dashboardEdit.setEditing(!editing)}
        aria-pressed={editing}
        className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-xs leading-[14px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-focus-ring)] ${
          editing
            ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-[var(--shadow-xs)]"
            : "text-[var(--text-3)] hover:text-[var(--text-1)]"
        }`}
        title={editing ? "Finish arranging the dashboard" : "Arrange your dashboard"}
      >
        {editing ? (
          <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {editing ? "Done" : "Edit"}
      </button>
    </div>
  );
}
