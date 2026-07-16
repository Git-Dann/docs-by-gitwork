"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowPathIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import {
  AVATAR_INITIALS,
  AVATAR_POSITION_DEFAULT,
  initialsFrom,
} from "@/lib/avatar";

type Source = "upload" | "google" | "initials";

export interface AvatarEditResult {
  /** Value for User.avatarUrl — a data/URL, "" (use Google), or the initials sentinel. */
  avatarUrl: string;
  /** CSS object-position, e.g. "50% 30%". "" when no image applies. */
  avatarPosition: string;
}

function parsePosition(pos: string): { x: number; y: number } {
  const m = /^(\d{1,3})% (\d{1,3})%$/.exec((pos ?? "").trim());
  if (!m) return { x: 50, y: 50 };
  return { x: clamp(Number(m[1])), y: clamp(Number(m[2])) };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * The single "Edit image" surface for the profile avatar. Pick a source (uploaded photo,
 * Google Workspace photo, or initials) and nudge the crop with placement sliders over a
 * live cover-fit preview — so faces aren't chopped off by the square/circular crops used
 * in the settings box and the sidebar.
 */
export function AvatarEditModal({
  open,
  onClose,
  name,
  googleAvatarUrl,
  initialAvatarUrl,
  initialPosition,
  saving = false,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  googleAvatarUrl: string;
  /** Current stored custom avatar value ("", a URL, or the initials sentinel). */
  initialAvatarUrl: string;
  initialPosition: string;
  saving?: boolean;
  onSave: (result: AvatarEditResult) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState<Source>("initials");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });

  // Seed draft state from the current values every time the modal is opened.
  useEffect(() => {
    if (!open) return;
    const custom = (initialAvatarUrl ?? "").trim();
    if (custom === AVATAR_INITIALS) {
      setSource("initials");
      setUploadedUrl("");
    } else if (custom) {
      setSource("upload");
      setUploadedUrl(custom);
    } else if (googleAvatarUrl) {
      setSource("google");
      setUploadedUrl("");
    } else {
      setSource("initials");
      setUploadedUrl("");
    }
    setPos(parsePosition(initialPosition));
  }, [open, initialAvatarUrl, initialPosition, googleAvatarUrl]);

  const previewSrc = useMemo(() => {
    if (source === "upload") return uploadedUrl;
    if (source === "google") return googleAvatarUrl;
    return "";
  }, [source, uploadedUrl, googleAvatarUrl]);

  const objectPosition = `${pos.x}% ${pos.y}%`;
  const initials = initialsFrom(name);
  const hasImage = source !== "initials" && Boolean(previewSrc);

  function handleFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) {
        setUploadedUrl(result);
        setSource("upload");
      }
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    let avatarUrl = "";
    if (source === "upload") avatarUrl = uploadedUrl;
    else if (source === "google") avatarUrl = ""; // empty → falls back to the Google photo
    else avatarUrl = AVATAR_INITIALS;
    onSave({ avatarUrl, avatarPosition: hasImage ? objectPosition : "" });
  }

  return (
    <Modal open={open} onClose={onClose} title="Profile image" panelClassName="w-full max-w-2xl">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.svg"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />

      {/* Two-column body: live preview on the left, controls on the right. */}
      <div className="grid gap-6 p-6 sm:grid-cols-2">
        {/* ── Left: live preview (square frame + circular sidebar chip) ── */}
        <div className="space-y-4">
          <div className="aspect-square w-full overflow-hidden rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)]">
            {hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc}
                alt="Avatar preview"
                className="h-full w-full object-cover"
                style={{ objectPosition }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--surface-brand)] text-5xl font-semibold text-[var(--brand-700)]">
                {initials}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[var(--border-2)] bg-[var(--surface-1)]">
              {hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewSrc}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ objectPosition }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--surface-brand)] text-sm font-semibold text-[var(--brand-700)]">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--text-2)]">Sidebar</p>
              <p className="text-[11px] text-[var(--text-4)]">How it appears in the nav.</p>
            </div>
          </div>
        </div>

        {/* ── Right: controls ── */}
        <div className="flex flex-col gap-5">
          {/* Source picker */}
          <div>
            <span className="text-xs font-medium text-[var(--text-2)]">Source</span>
            <div className="mt-1.5 grid gap-1.5">
              <SourceTab
                label="Upload a photo"
                active={source === "upload" && Boolean(uploadedUrl)}
                onClick={() => fileRef.current?.click()}
              />
              <SourceTab
                label="Google photo"
                active={source === "google"}
                disabled={!googleAvatarUrl}
                onClick={() => setSource("google")}
              />
              <SourceTab
                label="Initials"
                active={source === "initials"}
                onClick={() => setSource("initials")}
              />
            </div>
            {source === "upload" && uploadedUrl ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-700)] hover:underline"
              >
                <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                Replace file
              </button>
            ) : null}
          </div>

          {/* Placement — only meaningful when an image is shown */}
          {hasImage ? (
            <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-2)]">Placement</span>
                <button
                  type="button"
                  onClick={() => setPos({ x: 50, y: 50 })}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-4)] transition hover:text-[var(--text-2)]"
                >
                  <ArrowPathIcon className="h-3 w-3" />
                  Centre
                </button>
              </div>
              <PositionSlider
                label="Horizontal"
                value={pos.x}
                onChange={(x) => setPos((p) => ({ ...p, x }))}
              />
              <PositionSlider
                label="Vertical"
                value={pos.y}
                onChange={(y) => setPos((p) => ({ ...p, y }))}
              />
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-[var(--text-4)]">
              Pick a photo to fine-tune how it&apos;s cropped.
            </p>
          )}
        </div>
      </div>

      {/* Footer spans the full width below both columns. */}
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border-3)] px-6 py-4">
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={handleSave} loading={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

function SourceTab({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-[8px] border px-2 py-2 text-xs font-medium transition",
        active
          ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
          : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)] hover:bg-[var(--surface-1)]",
        disabled ? "cursor-not-allowed opacity-40 hover:bg-[var(--surface-0)]" : "",
      )}
    >
      {label}
    </button>
  );
}

function PositionSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[11px] text-[var(--text-3)]">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="h-1.5 flex-1 cursor-pointer accent-[var(--brand-600)]"
        aria-label={label}
      />
      <span
        className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}%
      </span>
    </label>
  );
}

export { AVATAR_POSITION_DEFAULT };
