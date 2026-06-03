"use client";

import { useRef, useState } from "react";
import { useSaveClientDesignSystem } from "@/hooks/use-design-system";
import type { DesignSystemStatus, DesignTokens, LogoAsset } from "@/types/design-tokens";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Read a file as a data URI, preserving format + transparency (SVG/PNG). */
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function LogoManagerModal({
  slug,
  tokens,
  status,
  onClose,
}: {
  slug: string;
  tokens: DesignTokens;
  status: DesignSystemStatus;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<LogoAsset[]>(tokens.logoRules?.assets ?? []);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const save = useSaveClientDesignSystem(slug);

  const update = (i: number, patch: Partial<LogoAsset>) =>
    setAssets((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const add = () =>
    setAssets((prev) => [...prev, { label: "", src: "", background: "light" }]);
  const remove = (i: number) => setAssets((prev) => prev.filter((_, idx) => idx !== i));

  const onFile = async (i: number, file: File | null) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (SVG or PNG keep transparency).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 2 MB or smaller.");
      return;
    }
    try {
      const src = await readDataUrl(file);
      const label = assets[i]?.label || file.name.replace(/\.[^.]+$/, "");
      update(i, { src, label });
    } catch {
      setError("Could not read that file.");
    }
  };

  const submit = async () => {
    setError(null);
    const cleaned = assets
      .filter((a) => a.src.trim())
      .map((a) => ({ label: a.label.trim() || "Logo", src: a.src, background: a.background }));
    const merged: DesignTokens = {
      ...tokens,
      logoRules: { ...(tokens.logoRules ?? {}), assets: cleaned },
    };
    try {
      await save.mutateAsync({ tokens: merged, status });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="widget-header shrink-0">
          <span className="widget-header__label">
            <span className="widget-header__label--number">··</span>
            {" // LOGO LOCKUPS"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-3)] hover:bg-[var(--surface-1)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <p className="text-[13px] text-[var(--text-3)]">
            Upload each lockup (e.g. Primary, White, Logomark). SVG or PNG keep transparency. Set the
            surface so it previews on the right background.
          </p>

          {assets.length === 0 && (
            <p className="rounded-[8px] border border-dashed border-[rgba(0,0,0,0.14)] py-8 text-center text-[13px] text-[var(--text-4)]">
              No logos yet — add one below.
            </p>
          )}

          {assets.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-[10px] border border-[rgba(0,0,0,0.08)] p-3"
            >
              <div
                className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)]"
                style={{ background: a.background === "dark" ? "#0F172A" : "#fff" }}
              >
                {a.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.src} alt="" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <span className="text-[10px] text-[var(--text-4)]">No image</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <input
                  value={a.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Label (e.g. Primary full logo)"
                  className="app-input"
                  style={{ height: 36 }}
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => {
                      fileInputs.current[i] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void onFile(i, e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputs.current[i]?.click()}
                    className="rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--brand-700)] hover:bg-[var(--surface-1)]"
                  >
                    {a.src ? "Replace" : "Upload"}
                  </button>
                  <select
                    value={a.background ?? "light"}
                    onChange={(e) => update(i, { background: e.target.value as "light" | "dark" })}
                    className="app-select"
                    style={{ height: 30, fontSize: 12 }}
                  >
                    <option value="light">On light</option>
                    <option value="dark">On dark</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="ml-auto text-[11px] font-medium text-[var(--danger,#DC2626)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={add}
            className="rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-1.5 text-[12px] font-medium text-[var(--brand-700)] hover:bg-[var(--surface-1)]"
          >
            + Add logo
          </button>

          {error && (
            <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] p-3 text-[12px] text-[#991B1B]">
              {error}
            </div>
          )}
          <p className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            Stored inline in the tokens — no external hosting needed.
          </p>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[rgba(0,0,0,0.08)] p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={save.isPending}
            className="rounded-[6px] bg-[var(--brand-600)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save logos"}
          </button>
        </div>
      </div>
    </div>
  );
}
