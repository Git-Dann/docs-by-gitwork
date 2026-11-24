"use client";

/**
 * The Light · System · Dark switch: a pill track with a round knob that slides between three
 * stops, squashes as it travels, and shows an animated sun or moon. Adapted from Lucy
 * Bichakhchyan's "Dark Mode Switcher" (CodePen, MIT; see docs/third-party-ui.md). Changes from
 * the original:
 *  - Foundry's modes, not Light · Sunset · Dark. The middle stop is System, and on System the
 *    knob shows the sun or the moon, whichever the device is using right now.
 *  - Colours come from Foundry's brand tokens, so the track is blue in light, navy in dark, and
 *    follows the seasonal themes. The sun and moon artwork keep their own colours.
 *  - Scoped to the component (the pen styled :root), sized by `size`, React state instead of
 *    DOM queries, and a unique id per instance for the SVG gradients.
 *  - Sounds live in src/lib/mode-switch-sounds.ts (on by default, per browser).
 * Styles are `.mode-switch*` in src/app/globals.css.
 */
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { useTheme, type ThemeMode } from "@/components/providers/theme-provider";
import { playModeSound } from "@/lib/mode-switch-sounds";

const STOPS: { mode: ThemeMode; label: string }[] = [
  { mode: "light", label: "Light" },
  { mode: "system", label: "System" },
  { mode: "dark", label: "Dark" },
];

/** Which artwork the knob wears: the sun for light, the moon for dark, and for System
 *  whichever the device is using. */
export function knobGlyph(mode: ThemeMode, resolved: "light" | "dark"): "sun" | "moon" {
  if (mode === "light") return "sun";
  if (mode === "dark") return "moon";
  return resolved === "dark" ? "moon" : "sun";
}

export function ModeSwitch({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  const { mode, resolved, setMode } = useTheme();
  const uid = useId().replace(/:/g, "");
  const index = Math.max(0, STOPS.findIndex((s) => s.mode === mode));
  const faceRef = useRef<HTMLSpanElement>(null);
  const stopRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The saved mode appears without animating: transitions switch on after two frames.
  const [instant, setInstant] = useState(true);
  useEffect(() => {
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setInstant(false));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, []);

  function choose(next: number) {
    if (next === index) return;
    const target = STOPS[next].mode;
    setMode(target);
    playModeSound(target);
    // The knob stretches along its path, then settles back to a circle.
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (faceRef.current?.animate && !reduced) {
      const stretch = 1 + 0.16 * Math.abs(next - index);
      faceRef.current.animate(
        [
          { transform: "scale(1, 1)" },
          { transform: `scale(${stretch}, ${2 - stretch})`, offset: 0.45 },
          { transform: "scale(0.96, 1.04)", offset: 0.8 },
          { transform: "scale(1, 1)" },
        ],
        { duration: 680, easing: "ease-in-out" },
      );
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: STOPS.length - 1 };
    if (!(e.key in step)) return;
    e.preventDefault();
    const next = (step[e.key] + STOPS.length) % STOPS.length;
    choose(next);
    stopRefs.current[next]?.focus();
  }

  const glyph = knobGlyph(mode, resolved);
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={onKeyDown}
      data-glyph={glyph}
      className={cn("mode-switch", size === "lg" && "mode-switch--lg", instant && "is-instant", className)}
      style={{ "--i": index } as React.CSSProperties}
    >
      <span className="mode-switch__knob" aria-hidden="true">
        <span ref={faceRef} className="mode-switch__face">
          {/* Sun: a warm core with rays that fan out, then turn slowly */}
          <svg className="mode-switch__glyph mode-switch__glyph--sun" viewBox="0 0 48 48">
            <defs>
              <radialGradient id={`${uid}-sun`} cx="40%" cy="35%" r="70%">
                <stop offset="0" stopColor="#FFE9B8" />
                <stop offset="1" stopColor="#E2A06E" />
              </radialGradient>
            </defs>
            <g className="mode-switch__rays">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, n) => (
                <g key={deg} transform={`rotate(${deg} 24 24)`}>
                  <line className="mode-switch__ray" style={{ "--n": n } as React.CSSProperties} x1="24" y1="4" x2="24" y2="9.5" />
                </g>
              ))}
            </g>
            <circle className="mode-switch__core" cx="24" cy="24" r="9.5" fill={`url(#${uid}-sun)`} />
          </svg>
          {/* Moon: a lit crescent with stars that appear and twinkle */}
          <svg className="mode-switch__glyph mode-switch__glyph--moon" viewBox="0 0 48 48">
            <defs>
              <linearGradient id={`${uid}-moon`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#F6F6F4" />
                <stop offset="1" stopColor="#8FB2FF" />
              </linearGradient>
            </defs>
            <g transform="translate(4 7) scale(1.5)">
              <path className="mode-switch__moon" d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" fill={`url(#${uid}-moon)`} />
            </g>
            <path className="mode-switch__star" style={{ "--d": 0 } as React.CSSProperties} d="M37 6.5Q37 10 40.5 10Q37 10 37 13.5Q37 10 33.5 10Q37 10 37 6.5Z" />
            <path className="mode-switch__star" style={{ "--d": 1 } as React.CSSProperties} d="M42 19Q42 21 44 21Q42 21 42 23Q42 21 40 21Q42 21 42 19Z" />
            <path className="mode-switch__star" style={{ "--d": 2 } as React.CSSProperties} d="M31 17.5Q31 19 32.5 19Q31 19 31 20.5Q31 19 29.5 19Q31 19 31 17.5Z" />
            <path className="mode-switch__star" style={{ "--d": 3 } as React.CSSProperties} d="M41 31Q41 32.5 42.5 32.5Q41 32.5 41 34Q41 32.5 39.5 32.5Q41 32.5 41 31Z" />
          </svg>
        </span>
      </span>

      {STOPS.map((s, n) => (
        <button
          key={s.mode}
          ref={(el) => {
            stopRefs.current[n] = el;
          }}
          type="button"
          role="radio"
          aria-checked={n === index}
          aria-label={`${s.label} theme`}
          title={s.mode === "system" ? "System theme (follows your device)" : `${s.label} theme`}
          tabIndex={n === index ? 0 : -1}
          data-mode={s.mode}
          className="mode-switch__stop"
          onClick={() => choose(n)}
        >
          {s.mode === "light" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
            </svg>
          ) : s.mode === "dark" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" />
            </svg>
          ) : (
            // System: a screen, half lit.
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4.5" width="18" height="12" rx="2" />
              <path d="M9 20h6M12 16.5V20" />
              <path d="M12 4.5v12" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
