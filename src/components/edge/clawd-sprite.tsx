"use client";

import { useEffect, useRef } from "react";

/**
 * Claw'd — Anthropic's Claude Code mascot, rendered natively on canvas from the sprite
 * poses shipped in the Claude Code CLI (extracted verbatim). Same source that drives the
 * Foundry Micro Stream Deck plugin; here it animates per agent state (idle / thinking /
 * needs-you / done / error), so the Edge board's agent shows real, live activity.
 *
 * Anthropic's mascot — used here as Claude's presence indicator on Gitwork's internal
 * exec board. Not a Gitwork brand mark.
 */

type Pose = [string, ColorKey, ColorKey][][];
type ColorKey = "b" | "k" | "w" | "d";
export type ClawdState = "idle" | "thinking" | "needs-you" | "done" | "error";

const BODY: [number, number, number] = [215, 119, 87]; // clawd_body (verbatim)
const BODY_DIM: [number, number, number] = [150, 82, 60];
const TILE: [number, number, number] = [11, 12, 15];
const WARNING: [number, number, number] = [232, 170, 72];
const DIM: [number, number, number] = [96, 102, 112];

const GLOW: Record<ClawdState, [number, number, number] | null> = {
  idle: null,
  thinking: [30, 175, 200],
  "needs-you": [232, 150, 60],
  done: [46, 170, 110],
  error: [210, 70, 70],
};
const DUR: Record<ClawdState, number> = { idle: 150, thinking: 85, "needs-you": 110, done: 90, error: 70 };

// Quadrant map (top-left, top-right, bottom-left, bottom-right) for the block glyphs.
const BLK: Record<string, [number, number, number, number]> = {
  " ": [0, 0, 0, 0], "█": [1, 1, 1, 1], "▌": [1, 0, 1, 0], "▐": [0, 1, 0, 1],
  "▀": [1, 1, 0, 0], "▄": [0, 0, 1, 1], "▘": [1, 0, 0, 0], "▝": [0, 1, 0, 0],
  "▖": [0, 0, 1, 0], "▗": [0, 0, 0, 1], "▙": [1, 0, 1, 1], "▟": [0, 1, 1, 1],
  "▛": [1, 1, 1, 0], "▜": [1, 1, 0, 1], "▞": [0, 1, 1, 0], "▚": [1, 0, 0, 1],
};

// --- OFFICIAL poses, extracted verbatim from cli.js ---
const POSE_A: Pose = [
  [["    ", "k", "k"], ["✻", "w", "k"], ["   ", "k", "k"]],
  [["    ", "k", "k"], ["│", "d", "k"], ["   ", "k", "k"]],
  [["   ", "k", "k"], ["▟█▙", "w", "k"], ["  ", "k", "k"]],
  [[" ▐", "b", "k"], ["▛███▜", "b", "k"], ["▌", "b", "k"]],
  [["▝▜", "b", "k"], ["█████", "b", "k"], ["▛▘", "b", "k"]],
  [["  ", "k", "k"], ["▘▘ ▝▝", "b", "k"], ["  ", "k", "k"]],
];
const POSE_B: Pose = [
  [["  ", "k", "k"], ["✻", "w", "k"], ["  ", "k", "k"]],
  [["  ", "k", "k"], ["│", "d", "k"], ["  ", "k", "k"]],
  [[" ", "k", "k"], ["▟█▙", "w", "k"], [" ", "k", "k"]],
  [["▗", "b", "k"], [" ▗   ▖ ", "k", "b"], ["▖", "b", "k"]],
  [[" ".repeat(7), "b", "b"]],
  [["▘▘ ▝▝", "b", "k"]],
];
const POSE_MED: Pose = [
  [["▗", "b", "k"], [" ▗     ▖ ", "k", "b"], ["▖", "b", "k"]],
  [[" ".repeat(9), "b", "b"]],
  [["█ █   █ █", "b", "k"]],
];
const POSE_BIG: Pose = [
  [[" █████████ ", "b", "k"]],
  [["██▄█████▄██", "b", "k"]],
  [[" █████████ ", "b", "k"]],
  [["█ █   █ █", "b", "k"]],
];

type Frame = { pose: Pose; bob: number; shake: number; spark: number; glow: [number, number, number] | null; body: [number, number, number] };
type Cell = { ch: string; fg: ColorKey; bg: ColorKey };

function cellsOf(row: [string, ColorKey, ColorKey][]): Cell[] {
  const out: Cell[] = [];
  for (const [txt, fg, bg] of row) for (const ch of txt) out.push({ ch, fg, bg });
  return out;
}

const TAU = Math.PI * 2;

function framesFor(state: ClawdState): Frame[] {
  const fr: Frame[] = [];
  const base = { shake: 0, glow: GLOW[state], body: BODY as [number, number, number] };
  if (state === "idle") {
    const N = 20;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const pose = i === 10 || i === 11 ? POSE_MED : Math.floor(i / 5) % 2 === 0 ? POSE_A : POSE_B;
      fr.push({ ...base, pose, bob: Math.sin(t * TAU) * 1.2, spark: 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * TAU)) });
    }
  } else if (state === "thinking") {
    const N = 12;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const pose = Math.floor(i / 2) % 2 === 0 ? POSE_A : POSE_B;
      fr.push({ ...base, pose, bob: Math.sin(t * 2 * TAU) * 0.8, spark: 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3 * TAU)) });
    }
  } else if (state === "needs-you") {
    const N = 14;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      fr.push({ ...base, pose: POSE_B, bob: -6 * Math.abs(Math.sin(t * TAU)), spark: 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 * TAU)) });
    }
  } else if (state === "done") {
    const seq = [POSE_B, POSE_B, POSE_MED, POSE_BIG, POSE_BIG, POSE_BIG, POSE_MED, POSE_B, POSE_B, POSE_B];
    for (const pose of seq) fr.push({ ...base, pose, bob: pose === POSE_BIG ? -3 : 0, spark: 1 });
  } else {
    const N = 12;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      fr.push({ ...base, pose: POSE_A, shake: 3 * Math.sin(t * 4 * TAU), bob: 0, spark: 0.5, glow: GLOW.error, body: BODY_DIM });
    }
  }
  return fr;
}

function rgb(c: [number, number, number], a = 1): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function drawSprite(ctx: CanvasRenderingContext2D, S: number, f: Frame) {
  const grid = f.pose.map(cellsOf);
  const maxw = Math.max(...grid.map((r) => r.length));
  const CELL = Math.floor(S / 12);
  const Q = CELL / 2;
  const scale = S / 144; // sprite motion is authored in 144px space
  const gw = maxw * CELL;
  const gh = grid.length * CELL;
  const x0 = (S - gw) / 2 + f.shake * scale;
  const y0 = (S - gh) / 2 + f.bob * scale;
  const col: Record<ColorKey, [number, number, number] | null> = { b: f.body, k: null, w: WARNING, d: DIM };

  for (let ri = 0; ri < grid.length; ri++) {
    const row = grid[ri];
    const pad = Math.floor((maxw - row.length) / 2);
    for (let ci = 0; ci < row.length; ci++) {
      const { ch, fg, bg } = row[ci];
      const x = x0 + (ci + pad) * CELL;
      const y = y0 + ri * CELL;
      const fgc = col[fg];
      const bgc = col[bg];
      if (ch === "✻") {
        if (fgc) {
          const cx = x + Q, cy = y + Q, r = Q * 0.95 * f.spark, w = Math.max(1, CELL * 0.12);
          ctx.strokeStyle = rgb(fgc);
          ctx.lineWidth = w;
          for (let a = 0; a < 180; a += 30) {
            const rad = (a * Math.PI) / 180, dx = Math.cos(rad) * r, dy = Math.sin(rad) * r;
            ctx.beginPath();
            ctx.moveTo(cx - dx, cy - dy);
            ctx.lineTo(cx + dx, cy + dy);
            ctx.stroke();
          }
          ctx.fillStyle = rgb(fgc);
          ctx.beginPath();
          ctx.arc(cx, cy, Q * 0.28, 0, TAU);
          ctx.fill();
        }
        continue;
      }
      if (ch === "│") {
        if (fgc) {
          const bw = Math.max(2, Q * 0.5);
          ctx.fillStyle = rgb(fgc);
          ctx.fillRect(x + Q - bw / 2, y, bw, CELL);
        }
        continue;
      }
      const [tl, tr, bl, br] = BLK[ch] ?? [0, 0, 0, 0];
      const quads: [number, number, number][] = [
        [tl, x, y], [tr, x + Q, y], [bl, x, y + Q], [br, x + Q, y + Q],
      ];
      for (const [on, qx, qy] of quads) {
        const c = on ? fgc : bgc;
        if (c) {
          ctx.fillStyle = rgb(c);
          ctx.fillRect(qx, qy, Q + 0.5, Q + 0.5); // +0.5 avoids hairline seams
        }
      }
    }
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, S: number, f: Frame) {
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = rgb(TILE);
  ctx.fillRect(0, 0, S, S);
  if (f.glow) {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.55);
    g.addColorStop(0, rgb(f.glow, 0.42));
    g.addColorStop(1, rgb(f.glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  drawSprite(ctx, S, f);
}

export function ClawdSprite({ state, size = 150 }: { state: ClawdState; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const S = size * dpr;
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frames = framesFor(state);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || frames.length <= 1) {
      drawFrame(ctx, S, frames[Math.min(3, frames.length - 1)]);
      return;
    }
    let i = 0;
    drawFrame(ctx, S, frames[0]);
    const t = setInterval(() => {
      i = (i + 1) % frames.length;
      drawFrame(ctx, S, frames[i]);
    }, DUR[state]);
    return () => clearInterval(t);
  }, [state, size]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, borderRadius: 18, display: "block" }}
      role="img"
      aria-label={`Claw'd — ${state}`}
    />
  );
}
