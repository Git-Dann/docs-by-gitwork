"use client";

import { useEffect, useRef, useState } from "react";
import { GitworkMark } from "./os-apps";
import { DiscoBallArt, DustCloudArt, RocketArt, SmokeArt } from "./os-art";

/**
 * Gitwork OS — the celebrations. Each moment gets its own, so a celebration means
 * something: confetti cannons for shipping, fireworks for finishing the last 20%, a
 * rocket for Ship It, a real party mode, a CRT power-off for Shut Down and a puff of
 * dust for the Trash. Every one is pointer-transparent, ends on its own, and is
 * skipped under prefers-reduced-motion.
 */

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const PALETTE = ["#4F46E5", "#818CF8", "#A78BFA", "#FACC15", "#34D399", "#F472B6", "#38BDF8"];

/* Confetti — two cannons from the bottom corners, real arcs ─────────────── */

export function Confetti({ seed, onDone }: { seed: number; onDone: () => void }) {
  return <ParticleCanvas key={seed} kind="confetti" onDone={onDone} />;
}

/* Fireworks — bursts across the top of the screen ─────────────────────── */

export function Fireworks({ seed, onDone }: { seed: number; onDone: () => void }) {
  return <ParticleCanvas key={seed} kind="fireworks" onDone={onDone} />;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  colour: string;
  size: number;
  spin: number;
  angle: number;
  shape: "rect" | "dot";
  trail?: boolean;
}

function ParticleCanvas({ kind, onDone }: { kind: "confetti" | "fireworks"; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (reducedMotion()) {
      done.current();
      return;
    }
    const el = canvas.current!;
    const c = el.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    el.width = W * dpr;
    el.height = H * dpr;
    c.scale(dpr, dpr);
    const parts: Particle[] = [];
    const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];

    function cannon(fromLeft: boolean) {
      for (let i = 0; i < 110; i++) {
        const a = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7;
        const sp = 11 + Math.random() * 10;
        parts.push({
          x: fromLeft ? -10 : W + 10,
          y: H * 0.95,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0,
          max: 150 + Math.random() * 70,
          colour: pick(),
          size: 6 + Math.random() * 6,
          spin: (Math.random() - 0.5) * 0.4,
          angle: Math.random() * Math.PI,
          shape: Math.random() < 0.8 ? "rect" : "dot",
        });
      }
    }

    function burst(x: number, y: number) {
      const colour = pick();
      const n = 70;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const sp = 2.5 + Math.random() * 3.5;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 70 + Math.random() * 30, colour, size: 2.4, spin: 0, angle: 0, shape: "dot", trail: true });
      }
    }

    const timers: number[] = [];
    if (kind === "confetti") {
      cannon(true);
      cannon(false);
    } else {
      for (let i = 0; i < 7; i++) {
        timers.push(window.setTimeout(() => burst(W * (0.15 + Math.random() * 0.7), H * (0.12 + Math.random() * 0.3)), i * 380));
      }
    }

    let raf = 0;
    let frames = 0;
    function tick() {
      frames++;
      c.globalCompositeOperation = "source-over";
      if (kind === "fireworks") {
        // Fade the previous frame for trails, rather than clearing it.
        c.globalCompositeOperation = "destination-out";
        c.fillStyle = "rgba(0,0,0,0.22)";
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = "lighter";
      } else {
        c.clearRect(0, 0, W, H);
      }
      for (const p of parts) {
        p.life++;
        if (p.life > p.max) continue;
        if (kind === "confetti") {
          p.vx *= 0.985;
          p.vy = p.vy * 0.985 + 0.32;
          p.vx += Math.sin((p.life + p.angle * 10) / 12) * 0.08; // flutter
        } else {
          p.vx *= 0.97;
          p.vy = p.vy * 0.97 + 0.05;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        const alpha = Math.max(0, 1 - p.life / p.max);
        c.globalAlpha = alpha;
        c.fillStyle = p.colour;
        if (p.shape === "rect") {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.angle);
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2.2 * Math.abs(Math.cos(p.angle * 2)) + 1);
          c.restore();
        } else {
          c.beginPath();
          c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.globalAlpha = 1;
      const alive = parts.some((p) => p.life <= p.max);
      if (alive || frames < 60 || timers.length && frames < 200) raf = requestAnimationFrame(tick);
      else done.current();
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [kind]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 z-[9700] h-full w-full" />;
}

/* Rocket — Ship It ─────────────────────────────────────────────────────── */

export function Rocket({ onDone, onBurst }: { onDone: () => void; onBurst: () => void }) {
  const done = useRef(onDone);
  const boom = useRef(onBurst);
  done.current = onDone;
  boom.current = onBurst;
  useEffect(() => {
    if (reducedMotion()) {
      boom.current();
      done.current();
      return;
    }
    const a = setTimeout(() => boom.current(), 1250);
    const b = setTimeout(() => done.current(), 1500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[9690] overflow-hidden">
      {/* smoke billowing off the pad, then the vapour trail it leaves */}
      <div className="absolute bottom-[54px] left-1/2 -translate-x-1/2">
        <SmokeArt width={300} />
      </div>
      <div className="os-trail absolute bottom-[110px] left-1/2 h-[75vh] w-[18px] -translate-x-1/2 rounded-full bg-gradient-to-t from-white/0 via-white/30 to-white/0 blur-[6px]" />
      <div className="os-rocket absolute bottom-[86px] left-1/2">
        <RocketArt width={64} />
        {/* speed lines while it climbs */}
        {[-22, 22, -10, 12].map((x, i) => (
          <span
            key={i}
            className="os-speed absolute top-[40%] block w-[2px] rounded-full bg-white/60"
            style={{ left: `calc(50% + ${x}px)`, height: 40 + (i % 2) * 24, animationDelay: `${0.35 + i * 0.06}s` }}
          />
        ))}
      </div>
      <style>{`
        .os-rocket { transform: translate(-50%, 0); animation: os-rocket 1.3s cubic-bezier(.55,0,.75,.4) forwards; }
        @keyframes os-rocket {
          0% { transform: translate(-50%, 0) }
          6% { transform: translate(calc(-50% - 1.5px), 1px) }
          12% { transform: translate(calc(-50% + 1.5px), -1px) }
          18% { transform: translate(-50%, -4px) }
          100% { transform: translate(-50%, -115vh) }
        }
        .os-trail { transform-origin: bottom; animation: os-trail 1.5s ease-out .2s both; }
        @keyframes os-trail { 0% { transform: translateX(-50%) scaleY(0); opacity: 1 } 70% { opacity: .8 } 100% { transform: translateX(-50%) scaleY(1); opacity: 0 } }
        .os-speed { opacity: 0; animation: os-speed .5s linear infinite; }
        @keyframes os-speed { 0% { transform: translateY(0); opacity: 0 } 30% { opacity: .8 } 100% { transform: translateY(70px); opacity: 0 } }
      `}</style>
    </div>
  );
}

/* Party mode — a mode, not a burst ─────────────────────────────────────── */

export function PartyLights() {
  const [trail, setTrail] = useState<{ id: number; x: number; y: number; c: string }[]>([]);
  const id = useRef(0);
  useEffect(() => {
    if (reducedMotion()) return;
    let last = 0;
    function onMove(e: PointerEvent) {
      const t = performance.now();
      if (t - last < 28) return;
      last = t;
      const n = ++id.current;
      setTrail((list) => [...list.slice(-24), { id: n, x: e.clientX, y: e.clientY, c: PALETTE[n % PALETTE.length] }]);
      setTimeout(() => setTrail((list) => list.filter((s) => s.id !== n)), 700);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[9600] overflow-hidden">
      {/* Sweeping stage lights, screened over everything. */}
      <div className="os-beams absolute inset-[-50%] mix-blend-screen" />
      <div className="os-strobe absolute inset-0 mix-blend-overlay" />
      {/* The disco ball. */}
      <div className="os-ball absolute left-1/2 top-[28px] -translate-x-1/2">
        <DiscoBallArt size={84} />
      </div>
      {/* light thrown off the mirror tiles, drifting across the walls */}
      {Array.from({ length: 22 }).map((_, i) => (
        <span
          key={`spot${i}`}
          className="os-spot-dot absolute h-2.5 w-2.5 rounded-full"
          style={{
            left: `${(i * 47) % 100}%`,
            top: `${12 + ((i * 29) % 80)}%`,
            background: PALETTE[i % PALETTE.length],
            boxShadow: `0 0 14px 3px ${PALETTE[i % PALETTE.length]}`,
            animationDelay: `${-(i * 0.37)}s`,
          }}
        />
      ))}
      {trail.map((s) => (
        <span
          key={s.id}
          className="os-spark absolute h-2 w-2 rounded-full"
          style={{ left: s.x - 4, top: s.y - 4, background: s.c, boxShadow: `0 0 10px ${s.c}` }}
        />
      ))}
      <style>{`
        .os-beams {
          background: conic-gradient(from 0deg at 50% 0%, transparent 0deg, rgba(129,140,248,.35) 8deg, transparent 18deg, transparent 60deg, rgba(244,114,182,.3) 70deg, transparent 80deg, transparent 140deg, rgba(56,189,248,.3) 150deg, transparent 160deg, transparent 220deg, rgba(250,204,21,.28) 230deg, transparent 240deg, transparent 300deg, rgba(52,211,153,.3) 310deg, transparent 320deg);
          animation: os-beams 7s linear infinite;
        }
        @keyframes os-beams { to { transform: rotate(360deg) } }
        .os-strobe { animation: os-strobe .968s steps(1) infinite; }
        @keyframes os-strobe { 0% { background: rgba(129,140,248,.12) } 50% { background: rgba(244,114,182,.10) } }
        .os-ball { animation: os-drop .7s cubic-bezier(.3,1.4,.5,1) both, os-sway 3s ease-in-out .7s infinite alternate; transform-origin: 50% 0; }
        @keyframes os-drop { from { transform: translate(-50%, -120px) } to { transform: translate(-50%, 0) } }
        @keyframes os-sway { from { transform: translate(-50%, 0) rotate(-4deg) } to { transform: translate(-50%, 0) rotate(4deg) } }
        @media (prefers-reduced-motion: reduce) { .os-beams, .os-strobe, .os-ball, .os-spot-dot { animation: none } }
        .os-spot-dot { opacity: .75; animation: os-spot-dot 6s linear infinite; }
        @keyframes os-spot-dot { 0% { transform: translateX(-60px) } 50% { opacity: .9 } 100% { transform: translateX(60px); opacity: .5 } }
        .os-spark { animation: os-spark .7s ease-out forwards; }
        @keyframes os-spark { to { transform: translateY(18px) scale(0); opacity: 0 } }
      `}</style>
    </div>
  );
}

/* Shut Down — a CRT power-off, then a refusal ──────────────────────────── */

export function CrtShutdown({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"off" | "message">("off");
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const a = setTimeout(() => setPhase("message"), reducedMotion() ? 0 : 900);
    const b = setTimeout(() => done.current(), reducedMotion() ? 2200 : 3600);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <div className="absolute inset-0 z-[9900] bg-black" onClick={() => done.current()} role="presentation">
      {phase === "off" ? (
        <div className="os-crt absolute inset-0 bg-white" />
      ) : (
        <div className="os-refuse flex h-full w-full flex-col items-center justify-center bg-black text-white">
          <GitworkMark size={52} colour="#fff" />
          <p className="mt-6 font-[family-name:var(--font-display)] text-[34px] leading-none">Not before launch.</p>
          <p className="mt-3 text-[14px] text-white/60">Nobody shuts down with payments half-built.</p>
        </div>
      )}
      <style>{`
        .os-crt { animation: os-crt .9s cubic-bezier(.6,0,.4,1) forwards; background: radial-gradient(circle, #fff 0%, #c7d2fe 60%, #000 100%); }
        @keyframes os-crt {
          0% { opacity: 0 }
          8% { opacity: .9; transform: scale(1, 1) }
          45% { transform: scale(1, .004) }
          80% { transform: scale(.004, .004); opacity: 1 }
          100% { transform: scale(0, 0); opacity: 0 }
        }
        .os-refuse { animation: os-fade .5s ease-out both; }
        @keyframes os-fade { from { opacity: 0; transform: scale(.98) } }
      `}</style>
    </div>
  );
}

/* Poof — a puff of dust where something was thrown away ─────────────────── */

export function Poof({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), 700);
    return () => clearTimeout(t);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute z-[9650] -translate-x-1/2 -translate-y-[70%]" style={{ left: x, top: y }}>
      <DustCloudArt size={130} />
    </div>
  );
}
