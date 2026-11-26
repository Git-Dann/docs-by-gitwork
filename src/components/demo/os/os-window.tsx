"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { DOCK_RESERVE, MENU_BAR_H, type OsWindow } from "@/lib/demo/os/window-manager";
import { dockIconRect } from "./os-chrome";

function calm(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The transform that shrinks a window into its dock icon (the Genie, simplified). */
function toDock(el: HTMLElement, app: OsWindow["app"]): Keyframe | null {
  const icon = dockIconRect(app);
  if (!icon) return null;
  const r = el.getBoundingClientRect();
  const dx = icon.left + icon.width / 2 - (r.left + r.width / 2);
  const dy = icon.top + icon.height / 2 - (r.top + r.height / 2);
  const s = Math.max(0.04, icon.width / r.width);
  return { transform: `translate(${dx}px, ${dy}px) scale(${s}, ${s * 0.7})`, opacity: 0.2 };
}

interface Props {
  win: OsWindow;
  focused: boolean;
  /** Below lg every window is a full-screen sheet: no dragging, no resizing. */
  compact: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimise: () => void;
  onToggleMaximise: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  /** Tells the desktop a drag is live, so iframes stop swallowing the pointer. */
  onDragState: (dragging: boolean) => void;
  children: ReactNode;
}

/**
 * A Mac window. Colours come from the desktop's `--os-*` variables (gitwork-os.tsx),
 * which follow the demo's own Appearance setting rather than Foundry's theme: this
 * is a picture of a Mac, so it has a Mac's light and dark, not ours.
 */
export function OsWindowFrame({
  win,
  focused,
  compact,
  onFocus,
  onClose,
  onMinimise,
  onToggleMaximise,
  onMove,
  onResize,
  onDragState,
  children,
}: Props) {
  const drag = useRef<{ kind: "move" | "resize"; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const el = useRef<HTMLElement>(null);
  const [moving, setMoving] = useState(false);
  const busy = useRef(false);
  const wasMinimised = useRef(win.minimised);

  // Open: grow in from slightly smaller, as a Mac window does.
  useLayoutEffect(() => {
    if (calm() || !el.current) return;
    el.current.animate(
      [{ opacity: 0, transform: "scale(0.94) translateY(8px)" }, { opacity: 1, transform: "none" }],
      { duration: 240, easing: "cubic-bezier(.2,.9,.3,1.05)" },
    );
  }, []);

  // Restore from the dock: come back out of the icon.
  useEffect(() => {
    if (wasMinimised.current && !win.minimised && el.current && !calm()) {
      const from = toDock(el.current, win.app);
      if (from) el.current.animate([from, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.9,.3,1)" });
    }
    wasMinimised.current = win.minimised;
  }, [win.minimised, win.app]);

  function animateClose() {
    if (busy.current) return;
    if (calm() || !el.current) return onClose();
    busy.current = true;
    const a = el.current.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.95)" }], {
      duration: 150,
      easing: "ease-in",
      fill: "forwards",
    });
    a.onfinish = () => {
      busy.current = false;
      onClose();
    };
  }

  function animateMinimise() {
    if (busy.current) return;
    const to = el.current && !calm() ? toDock(el.current, win.app) : null;
    if (!to || !el.current) return onMinimise();
    busy.current = true;
    const a = el.current.animate([{ opacity: 1, transform: "none" }, to], { duration: 360, easing: "cubic-bezier(.55,0,.8,.4)" });
    a.onfinish = () => {
      busy.current = false;
      onMinimise();
    };
  }

  function begin(kind: "move" | "resize", e: ReactPointerEvent<HTMLElement>) {
    if (compact || e.button !== 0) return;
    // A press on a control is a click, not a drag.
    if (kind === "move" && (e.target as HTMLElement).closest("button, input, a, [data-no-drag]")) return;
    if (kind === "move" && win.maximised) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      kind,
      sx: e.clientX,
      sy: e.clientY,
      ox: kind === "move" ? win.x : win.w,
      oy: kind === "move" ? win.y : win.h,
    };
    setMoving(true);
    onDragState(true);
  }

  function track(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === "move") onMove(d.ox + dx, d.oy + dy);
    else onResize(d.ox + dx, d.oy + dy);
  }

  function end(e: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setMoving(false);
    onDragState(false);
  }

  const full = compact || win.maximised;
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  // Both shapes use the same four properties, so zooming in and out can animate.
  const style = full
    ? { left: 0, top: MENU_BAR_H, width: vw, height: vh - MENU_BAR_H - (compact ? DOCK_RESERVE : DOCK_RESERVE - 6), zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };
  const zoomTransition = moving || compact || calm() ? undefined : "left .32s cubic-bezier(.2,.9,.3,1), top .32s cubic-bezier(.2,.9,.3,1), width .32s cubic-bezier(.2,.9,.3,1), height .32s cubic-bezier(.2,.9,.3,1)";

  const dragHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => begin("move", e),
    onPointerMove: track,
    onPointerUp: end,
    onPointerCancel: end,
    onDoubleClick: (e: React.MouseEvent<HTMLElement>) => {
      if (!compact && !(e.target as HTMLElement).closest("button, input, a, [data-no-drag]")) onToggleMaximise();
    },
  };

  return (
    <section
      ref={el}
      role="dialog"
      aria-label={win.title}
      onPointerDownCapture={onFocus}
      className={cn(
        "os-window absolute flex flex-col overflow-hidden bg-[var(--os-win)] text-[var(--os-text)]",
        compact ? "rounded-none" : "rounded-[12px]",
        // Mac windows draw a 1px inner light edge and a deep, soft shadow; an unfocused
        // window's shadow is shallower so the focused one reads as on top.
        focused
          ? "shadow-[0_0_0_0.5px_rgba(0,0,0,0.5),inset_0_0_0_0.5px_rgba(255,255,255,0.14),0_28px_70px_-10px_rgba(0,0,0,0.6)]"
          : "shadow-[0_0_0_0.5px_rgba(0,0,0,0.45),inset_0_0_0_0.5px_rgba(255,255,255,0.08),0_14px_36px_-8px_rgba(0,0,0,0.45)]",
      )}
      style={{ ...style, transition: zoomTransition, willChange: moving ? "left, top" : undefined }}
    >
      <header
        {...dragHandlers}
        className="relative flex h-[38px] shrink-0 select-none items-center border-b border-[var(--os-border)] bg-[var(--os-titlebar)] px-3"
      >
        <TrafficLights
          focused={focused}
          compact={compact}
          maximised={win.maximised}
          onClose={animateClose}
          onMinimise={animateMinimise}
          onToggleMaximise={onToggleMaximise}
        />
        <span
          className={cn(
            "pointer-events-none absolute left-1/2 max-w-[55%] -translate-x-1/2 truncate text-[13px] font-semibold",
            focused ? "text-[var(--os-text)]" : "text-[var(--os-text-3)]",
          )}
          title={win.title}
        >
          {win.title}
        </span>
      </header>

      <div className="relative min-h-0 flex-1 overflow-auto">{children}</div>

      {full ? null : (
        <div
          aria-hidden
          onPointerDown={(e) => begin("resize", e)}
          onPointerMove={track}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute bottom-0 right-0 z-30 h-4 w-4 cursor-nwse-resize"
        />
      )}
    </section>
  );
}

export function TrafficLights({
  focused,
  compact,
  maximised,
  onClose,
  onMinimise,
  onToggleMaximise,
}: {
  focused: boolean;
  compact: boolean;
  maximised: boolean;
  onClose: () => void;
  onMinimise: () => void;
  onToggleMaximise: () => void;
}) {
  return (
    // Hovering the group reveals every glyph at once, as on a Mac.
    <div className="group/lights relative z-30 flex items-center gap-2" data-no-drag>
      <Light label="Close" colour="#FF5F57" focused={focused} onClick={onClose}>
        <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
      </Light>
      <Light label="Minimise" colour="#FEBC2E" focused={focused} onClick={onMinimise}>
        <path d="M2.8 6h6.4" />
      </Light>
      {compact ? null : (
        <Light label={maximised ? "Exit full screen" : "Full screen"} colour="#28C840" focused={focused} onClick={onToggleMaximise}>
          {maximised ? (
            <path d="M5 2.6v2.4H2.6M7 9.4V7h2.4" />
          ) : (
            <path d="M3 6.4V3h3.4M9 5.6V9H5.6" />
          )}
        </Light>
      )}
    </div>
  );
}

function Light({
  label,
  colour,
  focused,
  onClick,
  children,
}: {
  label: string;
  colour: string;
  focused: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-3 w-3 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      // An unfocused window's lights go grey, exactly as macOS does.
      style={{
        background: focused ? colour : "var(--os-light-off)",
        boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.22)",
      }}
    >
      <svg
        viewBox="0 0 12 12"
        className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/lights:opacity-100 group-focus-within/lights:opacity-100"
        fill="none"
        stroke="rgba(0,0,0,0.6)"
        strokeWidth="1.3"
        strokeLinecap="round"
      >
        {children}
      </svg>
    </button>
  );
}
