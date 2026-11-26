"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { GOT_RID_OF, LAST_20, TAGLINE } from "@/lib/demo/os/gitwork-content";
import { GitworkMark } from "./os-apps";

/**
 * The moments of delight. Every one is dismissable by a click or Escape, and every
 * animation stops under prefers-reduced-motion — a joke that traps someone, or makes
 * them feel ill, stops being one.
 */

/* Confetti — on ship, on emptying the Trash, on the live activity reaching 100% */
export function Confetti({ seed }: { seed: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }).map((_, i) => {
        const r = (n: number) => {
          const x = Math.sin(seed * 997 + i * 31 + n * 7) * 10000;
          return x - Math.floor(x);
        };
        return {
          left: r(1) * 100,
          delay: r(2) * 0.6,
          duration: 1.6 + r(3) * 1.4,
          rotate: r(4) * 720 - 360,
          drift: r(5) * 160 - 80,
          colour: ["#4F46E5", "#818CF8", "#A78BFA", "#FACC15", "#34D399", "#F472B6"][Math.floor(r(6) * 6)],
          w: 6 + r(7) * 6,
        };
      }),
    [seed],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[9700] overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="os-confetti absolute top-[-20px] block"
          style={
            {
              left: `${p.left}%`,
              width: p.w,
              height: p.w * 0.45,
              background: p.colour,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--rot": `${p.rotate}deg`,
              "--drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
      <style>{`
        .os-confetti { animation-name: os-fall; animation-timing-function: cubic-bezier(.2,.6,.4,1); animation-fill-mode: forwards; }
        @keyframes os-fall { to { transform: translate(var(--drift), 105vh) rotate(var(--rot)); } }
        @media (prefers-reduced-motion: reduce) { .os-confetti { display: none; } }
      `}</style>
    </div>
  );
}

/* Restart — a boot screen with a progress bar */
export function BootScreen({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPct((p) => Math.min(100, p + 4 + Math.random() * 9)), 90);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (pct < 100) return;
    const t = setTimeout(onDone, 350);
    return () => clearTimeout(t);
  }, [pct, onDone]);
  return (
    <div className="absolute inset-0 z-[9900] flex flex-col items-center justify-center bg-black" onClick={onDone}>
      <GitworkMark size={84} colour="#fff" />
      <div className="mt-12 h-[5px] w-[200px] overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-white transition-[width] duration-100" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* Sleep — the lock screen */
export function LockScreen({ now, wallpaper, onWake }: { now: Date; wallpaper: string; onWake: () => void }) {
  useEffect(() => {
    const onKey = () => onWake();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onWake]);
  return (
    <button
      type="button"
      aria-label="Wake"
      onClick={onWake}
      className="absolute inset-0 z-[9900] flex flex-col items-center text-white"
      style={{ background: wallpaper }}
    >
      <span className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" />
      <span className="relative mt-[12vh] text-[22px] font-medium opacity-90">
        {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      </span>
      <span className="relative font-[family-name:var(--font-display)] text-[min(26vw,150px)] leading-none tracking-[-0.02em]">
        {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="relative mt-auto mb-[12vh] flex flex-col items-center gap-3">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur">
          <GitworkMark size={30} colour="#fff" />
        </span>
        <span className="text-[14px] font-medium">{TAGLINE}</span>
        <span className="text-[12px] opacity-70">Click or press any key to wake</span>
      </span>
    </button>
  );
}

/* Matrix — the terminal's `matrix`, and the Konami code */
export function MatrixRain({ onDone }: { onDone: () => void }) {
  const cols = useMemo(
    () =>
      Array.from({ length: 42 }).map((_, i) => ({
        left: (i / 42) * 100,
        delay: (i * 37) % 23 / 10,
        text: Array.from({ length: 30 })
          .map((__, j) => "01gitworkshipit{}<>/;"[(i * 7 + j * 13) % 21])
          .join("\n"),
      })),
    [],
  );
  useEffect(() => {
    const t = setTimeout(onDone, 5200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="absolute inset-0 z-[9800] overflow-hidden bg-black/90" onClick={onDone} role="presentation">
      {cols.map((c, i) => (
        <pre
          key={i}
          aria-hidden
          className="os-rain absolute top-0 m-0 whitespace-pre font-[family-name:var(--font-mono)] text-[14px] leading-[1.1] text-[#4ADE80]"
          style={{ left: `${c.left}%`, animationDelay: `${c.delay}s` }}
        >
          {c.text}
        </pre>
      ))}
      <p className="absolute inset-x-0 bottom-[14vh] text-center font-[family-name:var(--font-mono)] text-[15px] text-white">
        Wake up. Your prototype has a production problem.
      </p>
      <style>{`
        .os-rain { animation: os-rain 2.6s linear infinite; opacity: .85; }
        @keyframes os-rain { from { transform: translateY(-100%); } to { transform: translateY(100vh); } }
        @media (prefers-reduced-motion: reduce) { .os-rain { animation: none; } }
      `}</style>
    </div>
  );
}

/* Vibe check — the "last 20%" run as a scan */
export function VibeCheck({ onClose, onShipped }: { onClose: () => void; onShipped: () => void }) {
  const [step, setStep] = useState(0);
  // The parent passes a fresh callback every render; calling it from an effect keyed
  // on it would re-fire on each render it causes. Once, then never again.
  const shipped = useRef(false);
  const onShippedRef = useRef(onShipped);
  onShippedRef.current = onShipped;
  useEffect(() => {
    if (step > LAST_20.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), 520);
    return () => clearTimeout(t);
  }, [step]);
  useEffect(() => {
    if (step === LAST_20.length + 1 && !shipped.current) {
      shipped.current = true;
      onShippedRef.current();
    }
  }, [step]);
  const finished = step > LAST_20.length;
  return (
    <Sheet title="Vibe check" onClose={onClose}>
      <p className="text-[12.5px] text-[var(--os-text-2)]">Checking your half-built app against the last 20%…</p>
      <ul className="mt-3 space-y-2">
        {LAST_20.map((item, i) => {
          const state = i < step ? (item.done ? "ok" : "fixed") : i === step ? "run" : "wait";
          return (
            <li key={item.label} className="flex items-center gap-2.5 text-[13px]">
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                  state === "ok" && "bg-[#22C55E] text-white",
                  state === "fixed" && "bg-[#4F46E5] text-white",
                  state === "run" && "animate-spin border-2 border-[#818CF8] border-t-transparent",
                  state === "wait" && "border border-[var(--os-border-strong)]",
                )}
              >
                {state === "ok" || state === "fixed" ? "✓" : ""}
              </span>
              <span className="flex-1">{item.label}</span>
              {state === "fixed" ? <span className="text-[11px] text-[#818CF8]">finished by Gitwork</span> : null}
            </li>
          );
        })}
      </ul>
      <p className={cn("mt-4 text-[14px] font-semibold transition-opacity", finished ? "opacity-100" : "opacity-0")}>
        Ready for production.
      </p>
    </Sheet>
  );
}

/* Force Quit — the agency habits Gitwork doesn't have */
export function ForceQuit({ onClose, onQuit }: { onClose: () => void; onQuit: (name: string) => void }) {
  const [left, setLeft] = useState(GOT_RID_OF.map((g) => g.name));
  const [selected, setSelected] = useState<string | null>(GOT_RID_OF[0].name);
  return (
    <Sheet title="Force Quit Applications" onClose={onClose}>
      <p className="text-[12.5px] text-[var(--os-text-2)]">If an agency habit doesn&apos;t respond for a while, select it and click Force Quit.</p>
      <ul className="mt-3 h-[150px] overflow-auto rounded-[6px] border border-[var(--os-border-strong)] bg-[var(--os-paper)]">
        {left.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => setSelected(name)}
              className={cn("flex w-full items-center gap-2 px-3 py-1 text-left text-[13px]", selected === name && "bg-[#4F46E5] text-white")}
            >
              <span aria-hidden>🐌</span>
              {name}
              <span className="ml-auto text-[11px] opacity-60">(not responding)</span>
            </button>
          </li>
        ))}
        {left.length === 0 ? <li className="px-3 py-2 text-[13px] text-[var(--os-text-3)]">All quiet. That&apos;s how Gitwork runs.</li> : null}
      </ul>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            onQuit(selected);
            const next = left.filter((n) => n !== selected);
            setLeft(next);
            setSelected(next[0] ?? null);
          }}
          className="rounded-[7px] bg-[#4F46E5] px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          Force Quit
        </button>
      </div>
    </Sheet>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-[9750] flex items-start justify-center bg-black/25 pt-[14vh]" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
        className="os-sheet w-[min(420px,calc(100vw-24px))] rounded-[14px] border border-[var(--os-border-strong)] bg-[var(--os-win)] p-5 text-[var(--os-text)] shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-[6px] px-1.5 text-[16px] text-[var(--os-text-3)] hover:bg-[var(--os-hover)]">
            ×
          </button>
        </div>
        <div className="mt-2">{children}</div>
      </div>
      <style>{`
        .os-sheet { animation: os-sheet 0.3s cubic-bezier(.2,.9,.3,1.1); }
        @keyframes os-sheet { from { opacity: 0; transform: translateY(-12px) scale(.98); } }
        @media (prefers-reduced-motion: reduce) { .os-sheet { animation: none; } }
      `}</style>
    </div>
  );
}

/** ↑ ↑ ↓ ↓ ← → ← → b a */
export const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export function konamiStep(progress: number, key: string): number {
  if (key === KONAMI[progress]) return progress + 1;
  return key === KONAMI[0] ? 1 : 0;
}
