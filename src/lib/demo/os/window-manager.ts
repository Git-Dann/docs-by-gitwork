/**
 * Gitwork OS (`/demo/os`) — the window manager, as a pure reducer.
 *
 * Framework-free so it can be unit-tested without a DOM: every position and size
 * the desktop draws comes out of here. Three rules it keeps, each with a test:
 *
 *  1. **A title bar can never leave the screen.** Dragging, resizing, opening and
 *     the browser window shrinking all clamp it back, because a window whose title
 *     bar is off-screen cannot be dragged back or closed — it is simply lost.
 *  2. **Opening something that is already open focuses it** rather than stacking a
 *     second copy (one window per app).
 *  3. **A dock click behaves like a dock.** Minimised → restore. Focused → minimise.
 *     Anything else → bring to front.
 */

export type OsApp =
  | "finder"
  | "foundry"
  | "services"
  | "notes"
  | "terminal"
  | "mail"
  | "calendar"
  | "settings"
  | "trash"
  | "about";

export interface OsWindowProps {
  /** Page shown by the Foundry window. Always a same-origin demo page (isDemoHref). */
  href?: string;
  /** Case study selected in the Finder. */
  item?: string;
}

export interface OsWindow {
  id: string;
  app: OsApp;
  title: string;
  props: OsWindowProps;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimised: boolean;
  maximised: boolean;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface OsState {
  windows: OsWindow[];
  /** Next z-index to hand out. Only ever grows. */
  nextZ: number;
  /** Counts opened windows, so new ones cascade instead of landing on top of each other. */
  opened: number;
}

export const MENU_BAR_H = 28;
/** Space kept clear for the dock at the bottom. */
export const DOCK_RESERVE = 84;
export const MIN_W = 320;
export const MIN_H = 220;
/** How much of a title bar must stay on screen horizontally to be grabbable. */
const GRAB_MARGIN = 96;
const TITLE_BAR_H = 36;
const CASCADE_STEP = 28;

export const DEFAULT_SIZE: Record<OsApp, { w: number; h: number }> = {
  finder: { w: 900, h: 560 },
  foundry: { w: 1240, h: 760 },
  services: { w: 980, h: 640 },
  notes: { w: 820, h: 560 },
  terminal: { w: 680, h: 420 },
  mail: { w: 620, h: 520 },
  calendar: { w: 720, h: 520 },
  settings: { w: 620, h: 480 },
  trash: { w: 560, h: 380 },
  about: { w: 340, h: 520 },
};

export const initialOsState: OsState = { windows: [], nextZ: 1, opened: 0 };

/** The identity two windows share when they are "the same thing": one window per app. */
export function windowKey(app: OsApp): string {
  return app;
}

/** Keep a window's title bar reachable and its body within the desktop where it fits. */
export function clampWindow(win: OsWindow, vp: Viewport): OsWindow {
  const maxW = Math.max(MIN_W, vp.width);
  const maxH = Math.max(MIN_H, vp.height - MENU_BAR_H);
  const w = Math.min(Math.max(win.w, MIN_W), maxW);
  const h = Math.min(Math.max(win.h, MIN_H), maxH);
  // Horizontally a window may hang off either side, but never so far that less than
  // GRAB_MARGIN of its title bar is left to grab.
  const minX = -(w - GRAB_MARGIN);
  const maxX = vp.width - GRAB_MARGIN;
  // Vertically the title bar must sit below the menu bar and above the bottom edge.
  const minY = MENU_BAR_H;
  const maxY = Math.max(MENU_BAR_H, vp.height - TITLE_BAR_H);
  return {
    ...win,
    w,
    h,
    x: Math.round(Math.min(Math.max(win.x, minX), maxX)),
    y: Math.round(Math.min(Math.max(win.y, minY), maxY)),
  };
}

function topmost(state: OsState): OsWindow | undefined {
  return state.windows
    .filter((w) => !w.minimised)
    .reduce<OsWindow | undefined>((top, w) => (!top || w.z > top.z ? w : top), undefined);
}

export function focusedId(state: OsState): string | null {
  return topmost(state)?.id ?? null;
}

function raise(state: OsState, id: string, patch: Partial<OsWindow> = {}): OsState {
  return {
    ...state,
    nextZ: state.nextZ + 1,
    windows: state.windows.map((w) => (w.id === id ? { ...w, ...patch, z: state.nextZ } : w)),
  };
}

export type OsAction =
  | { type: "open"; app: OsApp; title: string; props?: OsWindowProps; viewport: Viewport }
  | { type: "focus"; id: string }
  | { type: "close"; id: string }
  | { type: "minimise"; id: string }
  | { type: "toggleMaximise"; id: string }
  | { type: "move"; id: string; x: number; y: number; viewport: Viewport }
  | { type: "resize"; id: string; w: number; h: number; viewport: Viewport }
  | { type: "dock"; app: OsApp; title: string; viewport: Viewport }
  | { type: "fit"; viewport: Viewport }
  | { type: "closeAll" };

export function osReducer(state: OsState, action: OsAction): OsState {
  switch (action.type) {
    case "open": {
      const props = action.props ?? {};
      const key = windowKey(action.app);
      const existing = state.windows.find((w) => windowKey(w.app) === key);
      if (existing) {
        // Same thing already open: bring it back rather than stacking a copy. A browser
        // window asked for a new page keeps its place but follows the link.
        return raise(state, existing.id, {
          minimised: false,
          props: { ...existing.props, ...props },
          title: action.title,
        });
      }
      const size = DEFAULT_SIZE[action.app];
      const step = (state.opened % 8) * CASCADE_STEP;
      const w = Math.min(size.w, action.viewport.width - 48);
      const h = Math.min(size.h, action.viewport.height - MENU_BAR_H - DOCK_RESERVE - 24);
      const x = Math.max(24, Math.round((action.viewport.width - w) / 2) - 120 + step);
      const y = MENU_BAR_H + 24 + step;
      const win: OsWindow = clampWindow(
        {
          id: `${key}#${state.opened + 1}`,
          app: action.app,
          title: action.title,
          props,
          x,
          y,
          w,
          h,
          z: state.nextZ,
          minimised: false,
          maximised: false,
        },
        action.viewport,
      );
      return {
        windows: [...state.windows, win],
        nextZ: state.nextZ + 1,
        opened: state.opened + 1,
      };
    }
    case "focus":
      if (!state.windows.some((w) => w.id === action.id)) return state;
      if (focusedId(state) === action.id) return state;
      return raise(state, action.id, { minimised: false });
    case "close":
      return { ...state, windows: state.windows.filter((w) => w.id !== action.id) };
    case "minimise":
      return {
        ...state,
        windows: state.windows.map((w) => (w.id === action.id ? { ...w, minimised: true } : w)),
      };
    case "toggleMaximise": {
      const win = state.windows.find((w) => w.id === action.id);
      if (!win) return state;
      return raise(state, action.id, { maximised: !win.maximised, minimised: false });
    }
    case "move":
    case "resize": {
      return {
        ...state,
        windows: state.windows.map((w) => {
          if (w.id !== action.id) return w;
          const next =
            action.type === "move"
              ? { ...w, x: action.x, y: action.y, maximised: false }
              : { ...w, w: action.w, h: action.h, maximised: false };
          return clampWindow(next, action.viewport);
        }),
      };
    }
    case "dock": {
      const win = state.windows.find((w) => w.app === action.app);
      if (!win) {
        return osReducer(state, { type: "open", app: action.app, title: action.title, viewport: action.viewport });
      }
      if (win.minimised) return raise(state, win.id, { minimised: false });
      if (focusedId(state) === win.id) return osReducer(state, { type: "minimise", id: win.id });
      return raise(state, win.id);
    }
    case "fit":
      return { ...state, windows: state.windows.map((w) => clampWindow(w, action.viewport)) };
    case "closeAll":
      return { ...state, windows: [] };
  }
}

const APPS: readonly OsApp[] = [
  "finder",
  "foundry",
  "services",
  "notes",
  "terminal",
  "mail",
  "calendar",
  "settings",
  "trash",
  "about",
];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Read a saved layout back. Anything malformed is dropped rather than trusted: a
 * stored layout is whatever an older build (or a person poking at devtools) wrote.
 */
export function parseSavedState(raw: string | null, vp: Viewport): OsState {
  if (!raw) return initialOsState;
  try {
    const data = JSON.parse(raw) as { windows?: unknown };
    if (!Array.isArray(data?.windows)) return initialOsState;
    const windows: OsWindow[] = [];
    for (const item of data.windows.slice(0, 20)) {
      const w = item as Partial<OsWindow>;
      if (typeof w.id !== "string" || typeof w.title !== "string") continue;
      if (!APPS.includes(w.app as OsApp)) continue;
      if (![w.x, w.y, w.w, w.h, w.z].every(isFiniteNumber)) continue;
      const props: OsWindowProps = {};
      const p = (w.props ?? {}) as Record<string, unknown>;
      if (typeof p.item === "string") props.item = p.item;
      // Only ever a same-origin demo page: the Foundry window must not be steerable
      // to an arbitrary URL by editing storage.
      if (typeof p.href === "string" && isDemoHref(p.href)) props.href = p.href;
      windows.push(
        clampWindow(
          {
            id: w.id,
            app: w.app as OsApp,
            title: w.title,
            props,
            x: w.x as number,
            y: w.y as number,
            w: w.w as number,
            h: w.h as number,
            z: w.z as number,
            minimised: Boolean(w.minimised),
            maximised: Boolean(w.maximised),
          },
          vp,
        ),
      );
    }
    const nextZ = windows.reduce((m, w) => Math.max(m, w.z), 0) + 1;
    return { windows, nextZ, opened: windows.length };
  } catch {
    return initialOsState;
  }
}

/** A path the Foundry window may show: a demo page on this origin, nothing else. */
export function isDemoHref(href: string): boolean {
  return /^\/demo(?:[/?#]|$)/.test(href) && !href.startsWith("/demo/os");
}
