/**
 * Signature capture UI for /sign/[token].
 *
 * Two methods, tabbed:
 *   - DRAWN: HTML5 canvas with mouse + touch + pen support. Resampled to a 600×200 PNG data
 *            URL on submit.
 *   - TYPED: typed name rendered in a script font for visual representation. The font is one
 *            of three editorial scripts (Caveat / Great Vibes / Dancing Script) chosen by the
 *            signer. The payload is the typed string + chosen font key, not a rasterised image.
 *
 * Consent box: signer must type their name to enable the Sign button. This is the audited
 * `signedName` field — separate from `name` (the invite recipient) so we have an auditable
 * record of what they declared.
 *
 * Decline path: optional secondary "Decline" link with a reason textarea.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";

type Method = "DRAWN" | "TYPED";

interface SignatureCapturePanelProps {
  token: string;
  signerName: string;
  signerRole: string;
  requestMessage: string | null;
}

const TYPED_FONTS = [
  { key: "caveat", label: "Caveat", family: "var(--font-caveat), 'Brush Script MT', cursive" },
  { key: "great-vibes", label: "Great Vibes", family: "var(--font-great-vibes), 'Pinyon Script', cursive" },
  { key: "dancing-script", label: "Dancing Script", family: "var(--font-dancing-script), cursive" },
] as const;

export function SignatureCapturePanel({
  token,
  signerName,
  signerRole,
  requestMessage,
}: SignatureCapturePanelProps) {
  const [method, setMethod] = useState<Method>("DRAWN");
  const [typedFontKey, setTypedFontKey] = useState<(typeof TYPED_FONTS)[number]["key"]>("caveat");
  const [typedSignature, setTypedSignature] = useState(signerName);
  const [consentName, setConsentName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Decline state
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);

  // ── Canvas refs + state ────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasInk, setHasInk] = useState(false);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Configure canvas DPR + clear it on mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0F172A";
      ctx.lineWidth = 2.2;
    }
  }, []);

  function pointerPos(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointerPos(event);
  }

  function continueStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = pointerPos(event);
    const last = lastPointRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPointRef.current = pos;
    if (!hasInk) setHasInk(true);
  }

  function endStroke() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  // ── Submit ────────────────────────────────────────────────────────────────────────
  const canSubmit =
    !submitting &&
    consentName.trim().length > 0 &&
    consentName.trim().toLowerCase() === signerName.trim().toLowerCase() &&
    (method === "DRAWN" ? hasInk : typedSignature.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);

    try {
      let payload: string;
      let fontKey: string | undefined;
      if (method === "DRAWN") {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas unavailable.");
        payload = canvas.toDataURL("image/png");
      } else {
        payload = typedSignature.trim();
        fontKey = typedFontKey;
      }

      const res = await fetch(`/api/sign/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          payload,
          signedName: consentName.trim(),
          fontKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to submit signature.");
      setSuccess(true);
      // Refresh after a beat so the gate-state notice page takes over.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (declineReason.trim().length === 0) {
      setError("Please add a brief reason so the team can follow up.");
      return;
    }
    setDeclining(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to decline.");
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setDeclining(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────────
  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">SIGNATURE</span>
        <span className="widget-header-right">{signerRole.toUpperCase()}</span>
      </div>
      <div className="space-y-6 p-6">
        {requestMessage ? (
          <div className="rounded-[10px] border-l-2 border-[var(--brand-600)] bg-[var(--brand-200)]/30 px-4 py-3 text-sm leading-6 text-[var(--text-2)]">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              Message from your contact
            </p>
            <p className="mt-1">{requestMessage}</p>
          </div>
        ) : null}

        <div>
          <div className="inline-flex rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
            {(["DRAWN", "TYPED"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  "h-9 px-4 rounded-[6px] text-sm font-medium transition",
                  method === m
                    ? "bg-white text-[var(--text-1)] shadow-[var(--shadow-xs)]"
                    : "text-[var(--text-3)]",
                )}
              >
                {m === "DRAWN" ? "Draw" : "Type"}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {method === "DRAWN" ? (
              <div>
                <canvas
                  ref={canvasRef}
                  onPointerDown={startStroke}
                  onPointerMove={continueStroke}
                  onPointerUp={endStroke}
                  onPointerCancel={endStroke}
                  onPointerLeave={endStroke}
                  className="block w-full touch-none rounded-[10px] border border-[var(--border-1)] bg-white"
                  style={{ height: 200, cursor: "crosshair" }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-[var(--text-4)]">
                    Sign above using mouse, trackpad, or touch.
                  </p>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="text-xs text-[var(--brand-700)] hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div
                  className="flex h-[200px] items-center justify-center rounded-[10px] border border-[var(--border-1)] bg-white px-6"
                  style={{
                    fontFamily: TYPED_FONTS.find((f) => f.key === typedFontKey)!.family,
                    fontSize: 56,
                    color: "#0F172A",
                  }}
                >
                  {typedSignature.trim() || "Your signature"}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    className="app-input"
                    placeholder="Type your name as you'd like it signed"
                    maxLength={120}
                  />
                  <select
                    value={typedFontKey}
                    onChange={(e) => setTypedFontKey(e.target.value as typeof typedFontKey)}
                    className="app-select"
                  >
                    {TYPED_FONTS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--border-3)] pt-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Type your full name to confirm
            </span>
            <input
              value={consentName}
              onChange={(e) => setConsentName(e.target.value)}
              className="app-input"
              placeholder={signerName}
              aria-describedby="consent-hint"
            />
            <span id="consent-hint" className="block text-xs text-[var(--text-4)]">
              By typing your name and clicking <strong>Sign document</strong> you agree your
              electronic signature has the same legal effect as a handwritten one, and that the
              IP address and timestamp of this action will be recorded for audit.
            </span>
          </label>

          {error ? (
            <p className="mt-3 text-sm font-medium text-[var(--danger-500)]">{error}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={submitting || success}
            >
              {success ? "Signed" : "Sign document"}
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size="md"
              onClick={() => setShowDecline((v) => !v)}
              disabled={submitting || success}
            >
              {showDecline ? "Cancel" : "Decline"}
            </Button>
          </div>

          {showDecline ? (
            <div className="mt-4 space-y-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
              <label className="block">
                <span className="text-sm font-medium text-[var(--text-2)]">Reason for declining</span>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="app-textarea mt-1.5"
                  rows={3}
                  placeholder="Briefly tell the team why so they can follow up."
                />
              </label>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleDecline}
                  loading={declining}
                  disabled={declineReason.trim().length === 0}
                >
                  Decline this request
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
