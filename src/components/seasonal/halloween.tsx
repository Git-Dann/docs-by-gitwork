"use client";

/**
 * The Halloween theme: a pumpkin toggle beside the notification bell, a pumpkin on the logo,
 * and the scene it switches on — fog rolling along the bottom of the screen, a few ghosts and
 * bats passing through.
 *
 * The colours are tokens (`[data-halloween]` in globals.css), set by the ThemeProvider, which
 * also decides where it can show (`HALLOWEEN_PATHS`). Nothing is drawn here:
 *   - the toggle is Tabler's outline pumpkin, to match the bell beside it;
 *   - the pumpkin and bats are Microsoft's Fluent Emoji (MIT, via Iconify); the ghosts mix
 *     Fluent, Google's Noto (Apache-2.0) and Tabler, so no two faces match;
 *   - the fog is Vanta's FOG shader (MIT) on three.js, loaded only while the theme is on.
 *
 * Two layers, and neither ever takes a click (`pointer-events: none`, `aria-hidden`, no print):
 *   - `HalloweenScene` (ghosts, bats) sits BEHIND Foundry: `-z-10` inside the shell root, which
 *     is `isolate`, with the page backgrounds see-through (`.halloween-clear`). So they show in
 *     gaps and gutters and never cover a card, a button or a line of text.
 *   - `HalloweenFogFront` sits in FRONT: a faint band along the bottom, above the Desk drawer
 *     (z-40) and below dialogs (z-70), light enough that text under it stays readable.
 * Reduced motion stills the fog and drops what moves.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import jackOLantern from "@iconify-icons/fluent-emoji-flat/jack-o-lantern";
import fluentGhost from "@iconify-icons/fluent-emoji-flat/ghost";
import notoGhost from "@iconify-icons/noto/ghost";
import batIcon from "@iconify-icons/fluent-emoji-flat/bat";
import { IconGhost3Filled, IconPumpkinScary } from "@tabler/icons-react";
import { cn } from "@/lib/format";
import { useTheme } from "@/components/providers/theme-provider";

/** The setting lives in the browser, so the server always renders "off"; match it until mounted. */
function useHalloweenShown(): boolean {
  const { halloween } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && halloween;
}

export function HalloweenToggle({ className }: { className?: string }) {
  const { halloweenAvailable, setHalloween } = useTheme();
  const halloween = useHalloweenShown();
  if (!halloweenAvailable) return null;
  return (
    <button
      type="button"
      onClick={() => setHalloween(!halloween)}
      aria-pressed={halloween}
      aria-label={halloween ? "Turn off the Halloween theme" : "Turn on the Halloween theme"}
      title={halloween ? "Turn off the Halloween theme" : "Halloween theme"}
      className={cn(
        "rounded-[6px] p-2 transition hover:bg-[var(--surface-1)]",
        halloween ? "text-[var(--brand-400)] drop-shadow-[0_0_8px_rgba(249,115,22,0.55)]" : "text-[var(--text-2)]",
        className,
      )}
    >
      <IconPumpkinScary className="h-6 w-6" stroke={1.75} />
    </button>
  );
}

/** A solid pumpkin sitting on the bottom-right of the logo. Place inside a `relative` wrapper. */
export function HalloweenLogoBadge() {
  if (!useHalloweenShown()) return null;
  return (
    <Icon
      icon={jackOLantern}
      aria-hidden
      className="pointer-events-none absolute -bottom-1.5 -right-4 h-7 w-7 drop-shadow-[0_0_10px_rgba(249,115,22,0.6)]"
    />
  );
}

type GhostFace = "fluent" | "noto" | "tabler";

/** Different faces, sizes, tilts and facings, so the ghosts don't read as one sprite repeated. */
const GHOSTS: { face: GhostFace; top: string; size: number; duration: number; delay: number; tilt: number; mirror?: boolean }[] = [
  { face: "fluent", top: "18%", size: 34, duration: 46, delay: -6, tilt: -8 },
  { face: "noto", top: "40%", size: 30, duration: 58, delay: -22, tilt: 6, mirror: true },
  { face: "tabler", top: "58%", size: 26, duration: 66, delay: -36, tilt: -4 },
  { face: "noto", top: "74%", size: 40, duration: 52, delay: -48, tilt: 10 },
];

function Ghost({ face, size }: { face: GhostFace; size: number }) {
  if (face === "tabler") return <IconGhost3Filled size={size} className="halloween-glow text-[rgba(244,242,255,0.9)]" />;
  return <Icon icon={face === "noto" ? notoGhost : fluentGhost} width={size} height={size} className="halloween-glow" />;
}

const BATS = [
  { top: "7%", size: 34, duration: 26, delay: -4 },
  { top: "13%", size: 28, duration: 34, delay: -19 },
] as const;

/** Ghosts and bats, behind the content. Render inside the shell root, which must be `isolate`. */
export function HalloweenScene() {
  if (!useHalloweenShown()) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden print:hidden">

      {GHOSTS.map((g, i) => (
        <span
          key={`g${i}`}
          className="halloween-drift absolute left-0"
          style={{ top: g.top, animationDuration: `${g.duration}s`, animationDelay: `${g.delay}s` }}
        >
          <span className="halloween-bob block opacity-85" style={{ animationDelay: `${i * -1.3}s` }}>
            <span className="block" style={{ transform: `rotate(${g.tilt}deg)${g.mirror ? " scaleX(-1)" : ""}` }}>
              <Ghost face={g.face} size={g.size} />
            </span>
          </span>
        </span>
      ))}

      {BATS.map((b, i) => (
        <span
          key={`b${i}`}
          className="halloween-drift absolute left-0"
          style={{ top: b.top, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }}
        >
          <span className="halloween-flap block">
            <Icon icon={batIcon} width={b.size} height={b.size} />
          </span>
        </span>
      ))}
    </div>
  );
}

/** The fog, in front of the content. */
export function HalloweenFogFront() {
  if (!useHalloweenShown()) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[45] overflow-hidden print:hidden">
      <HalloweenFog />
    </div>
  );
}

/**
 * Vanta's FOG shader in a band along the bottom, faded out upwards and screened onto the page
 * so only the light of the fog shows. three.js (~600KB) is only fetched while the theme is on.
 */
function HalloweenFog() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let effect: { destroy: () => void } | null = null;
    let cancelled = false;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void Promise.all([import("three"), import("vanta/dist/vanta.fog.min")])
      .then(([THREE, vanta]) => {
        if (cancelled || !ref.current) return;
        effect = vanta.default({
          el: ref.current,
          THREE,
          mouseControls: false,
          touchControls: false,
          gyroControls: false,
          highlightColor: 0xd8d0ff,
          midtoneColor: 0x7b6ad8,
          lowlightColor: 0x2a2160,
          baseColor: 0x0a0918,
          blurFactor: 0.62,
          speed: still ? 0 : 1.1,
          zoom: 0.8,
        });
      })
      .catch(() => {
        /* no WebGL, or the chunk failed — the theme still works without fog */
      });
    return () => {
      cancelled = true;
      effect?.destroy();
    };
  }, []);
  return <div ref={ref} className="halloween-fog" />;
}
