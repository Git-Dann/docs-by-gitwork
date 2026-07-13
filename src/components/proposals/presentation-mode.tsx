"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChatBubbleBottomCenterTextIcon,
  PaintBrushIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PresentationSlide } from "@/components/proposals/presentation-slide";
import { resolveProposalMergeVariables } from "@/lib/merge-variables";
import { cn } from "@/lib/format";
import type { ProposalDocument } from "@/types/proposal";

type DrawTool = "pen" | "highlighter" | "eraser";

// Ink palette for the (ephemeral) drawing tool. Bold, slide-legible — sticks to the brand blue +
// the semantic set; no off-system hues.
const INK_COLORS = ["#EF4444", "#F59E0B", "#1D4ED8", "#16A34A", "#0F172A"] as const;

/**
 * Presentation mode (v1) — renders an existing document as a full-screen slide deck. Each visible
 * top-level block becomes one slide (read-only, merge-variables resolved). Includes a speaker-notes
 * toggle (bottom-left) and an EPHEMERAL drawing/highlighter overlay (never persisted — cleared on
 * slide change and on exit). No bot, no compute; purely a presenter surface over the live doc.
 */
export function PresentationMode({
  proposal,
  onClose,
}: {
  proposal: ProposalDocument;
  onClose: () => void;
}) {
  // Resolve merge variables once so slides read like the shared/exported doc (not raw {{tokens}}).
  const resolved = useMemo(() => resolveProposalMergeVariables(proposal), [proposal]);
  const slides = useMemo(
    () =>
      [...resolved.sections]
        .filter((section) => section.isVisible)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [resolved.sections],
  );
  const total = slides.length;

  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState<string>(INK_COLORS[0]);
  const [size, setSize] = useState(4);
  // Bumped on every Clear so the canvas remounts and wipes — also remounts on slide change (keyed).
  const [clearNonce, setClearNonce] = useState(0);

  const current = slides[Math.min(index, Math.max(0, total - 1))];

  const goNext = useCallback(() => setIndex((i) => Math.min(total - 1, i + 1)), [total]);
  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Lock body scroll while the deck is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Keyboard: arrows/space navigate, N toggles notes, D toggles draw, Esc exits (or drops draw).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inField =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (inField) return;
      switch (event.key) {
        case "Escape":
          if (drawing) setDrawing(false);
          else onClose();
          break;
        case "ArrowRight":
        case "PageDown":
          goNext();
          break;
        case "ArrowLeft":
        case "PageUp":
          goPrev();
          break;
        case " ":
          if (!drawing) {
            event.preventDefault();
            goNext();
          }
          break;
        case "n":
        case "N":
          setShowNotes((v) => !v);
          break;
        case "d":
        case "D":
          setDrawing((v) => !v);
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, goNext, goPrev, onClose]);

  const notes = current?.speakerNotes?.trim() ?? "";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0F172A] text-white">
      {/* Top bar — slide counter + doc title + exit. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">
          Slide {Math.min(index + 1, total)} / {total}
        </span>
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden max-w-[40vw] truncate text-sm text-white/55 sm:inline">
            {proposal.title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-white/85 transition hover:bg-white/10"
          >
            <XMarkIcon className="h-4 w-4" />
            Exit
          </button>
        </div>
      </div>

      {/* Stage — the slide, click-to-navigate zones, and the (optional) drawing overlay. */}
      <div className="relative flex-1 overflow-hidden">
        {!drawing ? (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={goPrev}
              disabled={index === 0}
              className="absolute inset-y-0 left-0 z-10 w-[12%] cursor-w-resize disabled:cursor-default"
            />
            <button
              type="button"
              aria-label="Next slide"
              onClick={goNext}
              disabled={index >= total - 1}
              className="absolute inset-y-0 right-0 z-10 w-[12%] cursor-e-resize disabled:cursor-default"
            />
          </>
        ) : null}

        {/* Each slide is scaled to fit the stage (never scrolls) — a slide that fits renders 1×,
            a tall one shrinks uniformly. See <PresentationSlide>. */}
        <div className="absolute inset-0 flex items-center justify-center px-4 py-6 sm:px-10 sm:py-10">
          {current ? (
            <PresentationSlide section={current} proposal={resolved} index={index} />
          ) : (
            <div className="flex h-full items-center justify-center text-white/60">
              This document has no visible blocks to present.
            </div>
          )}
        </div>

        {drawing ? <DrawingOverlay key={`${index}-${clearNonce}`} tool={tool} color={color} size={size} /> : null}
      </div>

      {/* Notes drawer — bottom-left, presenter-only. Toggled by the notes button or "N". */}
      {showNotes ? (
        <div className="pointer-events-auto absolute bottom-20 left-4 z-20 w-[min(440px,calc(100vw-2rem))] rounded-[12px] border border-white/10 bg-[#1E293B] shadow-[0_18px_48px_-8px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Slide {index + 1} / {total} · Notes
            </span>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              aria-label="Hide notes"
              className="text-white/45 transition hover:text-white"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[40vh] overflow-y-auto px-4 py-3">
            <p className="text-[15px] font-semibold text-white">{current?.title}</p>
            {notes ? (
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-white/75">{notes}</p>
            ) : (
              <p className="mt-2 text-[13px] leading-6 text-white/40">
                No notes for this slide. Add presenter notes from a block&rsquo;s options in the editor.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Bottom bar — notes toggle (left) · nav (centre) · drawing tools (right). */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          aria-pressed={showNotes}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[13px] font-medium transition",
            showNotes
              ? "border-white/25 bg-white/15 text-white"
              : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10",
          )}
        >
          <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
          Notes
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            aria-label="Previous slide"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/15 bg-white/5 text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
          <span className="min-w-[64px] text-center font-mono text-xs text-white/60">
            {Math.min(index + 1, total)} / {total}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={index >= total - 1}
            aria-label="Next slide"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/15 bg-white/5 text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {drawing ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-white/15 bg-white/5 px-2 py-1.5">
              {/* Tool toggles */}
              <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} label="Pen">
                <PencilIcon className="h-4 w-4" />
              </ToolButton>
              <ToolButton active={tool === "highlighter"} onClick={() => setTool("highlighter")} label="Highlighter">
                <PaintBrushIcon className="h-4 w-4" />
              </ToolButton>
              <ToolButton active={tool === "eraser"} onClick={() => setTool("eraser")} label="Eraser">
                <EraserGlyph />
              </ToolButton>

              <span className="mx-0.5 h-5 w-px bg-white/15" />

              {/* Colour swatches (disabled for the eraser). */}
              <div className={cn("flex items-center gap-1", tool === "eraser" && "pointer-events-none opacity-40")}>
                {INK_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Ink ${c}`}
                    className={cn(
                      "h-5 w-5 rounded-full border transition",
                      color === c ? "border-white ring-2 ring-white/40" : "border-white/30",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              <span className="mx-0.5 h-5 w-px bg-white/15" />

              {/* Stroke width. */}
              <input
                type="range"
                min={2}
                max={28}
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
                aria-label="Stroke width"
                className="w-20 accent-[var(--brand-bright,#3B82F6)]"
              />

              <button
                type="button"
                onClick={() => setClearNonce((n) => n + 1)}
                aria-label="Clear drawing"
                title="Clear"
                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setDrawing((v) => !v)}
            aria-pressed={drawing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[13px] font-medium transition",
              drawing
                ? "border-white/25 bg-white/15 text-white"
                : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10",
            )}
          >
            <PencilIcon className="h-4 w-4" />
            {drawing ? "Done" : "Draw"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-[6px] transition",
        active ? "bg-white/20 text-white" : "text-white/65 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function EraserGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.7}>
      <path d="M8.5 19.5 4.5 15.5a2 2 0 0 1 0-2.8l7.2-7.2a2 2 0 0 1 2.8 0l3.9 3.9a2 2 0 0 1 0 2.8L13 17.6" strokeLinejoin="round" />
      <path d="M9 19.5h10" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Ephemeral free-hand drawing surface, sized to its container (DPR-aware for crisp strokes).
 * Remounted (cleared) on slide change and on Clear. Nothing here is ever saved.
 */
function DrawingOverlay({ tool, color, size }: { tool: DrawTool; color: string; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  // Latest tool settings, read inside pointer handlers without re-binding listeners.
  const settingsRef = useRef({ tool, color, size });
  settingsRef.current = { tool, color, size };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function fitCanvas() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Preserve the strokes already drawn across a resize.
      const snapshot = canvas.width && canvas.height ? ctx!.getImageData(0, 0, canvas.width, canvas.height) : null;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (snapshot) ctx!.putImageData(snapshot, 0, 0);
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
    }
    fitCanvas();

    const ro = new ResizeObserver(fitCanvas);
    ro.observe(canvas);

    function pointFromEvent(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function applyStroke() {
      const { tool: t, color: c, size: s } = settingsRef.current;
      if (t === "eraser") {
        ctx!.globalCompositeOperation = "destination-out";
        ctx!.globalAlpha = 1;
        ctx!.lineWidth = s * 3;
        ctx!.strokeStyle = "rgba(0,0,0,1)";
      } else if (t === "highlighter") {
        ctx!.globalCompositeOperation = "source-over";
        ctx!.globalAlpha = 0.3;
        ctx!.lineWidth = s * 4;
        ctx!.strokeStyle = c;
      } else {
        ctx!.globalCompositeOperation = "source-over";
        ctx!.globalAlpha = 1;
        ctx!.lineWidth = s;
        ctx!.strokeStyle = c;
      }
    }

    function onDown(event: PointerEvent) {
      event.preventDefault();
      drawingRef.current = true;
      const p = pointFromEvent(event);
      lastRef.current = p;
      applyStroke();
      // Dot for a tap.
      ctx!.beginPath();
      ctx!.moveTo(p.x, p.y);
      ctx!.lineTo(p.x + 0.01, p.y + 0.01);
      ctx!.stroke();
      canvas!.setPointerCapture(event.pointerId);
    }
    function onMove(event: PointerEvent) {
      if (!drawingRef.current || !lastRef.current) return;
      event.preventDefault();
      const p = pointFromEvent(event);
      applyStroke();
      ctx!.beginPath();
      ctx!.moveTo(lastRef.current.x, lastRef.current.y);
      ctx!.lineTo(p.x, p.y);
      ctx!.stroke();
      lastRef.current = p;
    }
    function onUp(event: PointerEvent) {
      drawingRef.current = false;
      lastRef.current = null;
      try {
        canvas!.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        "absolute inset-0 z-20 h-full w-full touch-none",
        tool === "eraser" ? "cursor-cell" : "cursor-crosshair",
      )}
    />
  );
}
