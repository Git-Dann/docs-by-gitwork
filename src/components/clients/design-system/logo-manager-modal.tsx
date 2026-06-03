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
  const bulkRef = useRef<HTMLInputElement | null>(null);
  const save = useSaveClientDesignSystem(slug);

  const update = (i: number, patch: Partial<LogoAsset>) =>
    setAssets((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const add = () =>
    setAssets((prev) => [...prev, { label: "", src: "", background: "light" }]);
  const remove = (i: number) => setAssets((prev) => prev.filter((_, idx) => idx !== i));

  const onReplace = async (i: number, file: File | null) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (SVG or PNG keep transparency).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Each image must be 2 MB or smaller.");
      return;
    }
    try {
      const src = await readDataUrl(file);
      update(i, { src, label: assets[i]?.label || file.name.replace(/\.[^.]+$/, "") });
    } catch {
      setError("Could not read that file.");
    }
  };

  // Bulk: add one row per selected file (label from filename) — edit after.
  const onBulk = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    let skipped = 0;
    const additions: LogoAsset[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") || file.size > MAX_BYTES) {
        skipped += 1;
        continue;
      }
      try {
        additions.push({
          label: file.name.replace(/\.[^.]+$/, ""),
          src: await readDataUrl(file),
          background: "light",
        });
      } catch {
        skipped += 1;
      }
    }
    if (additions.length) setAssets((prev) => [...prev, ...additions]);
    if (skipped) setError(`${skipped} file(s) skipped (not an image, or over 2 MB).`);
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
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        className="app-dialog-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="app-dialog-panel flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden">
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

          <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-md text-[13px] text-[var(--text-3)]">
                Upload each lockup (Primary, White, Logomark…). SVG or PNG keep transparency; set the
                surface so it previews on the right background.
              </p>
              <input
                ref={bulkRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void onBulk(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => bulkRef.current?.click()}
                className="shrink-0 rounded-[6px] bg-[var(--brand-600)] px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-[var(--brand-700)]"
              >
                Upload files…
              </button>
            </div>

            {assets.length === 0 ? (
              <p className="rounded-[8px] border border-dashed border-[rgba(0,0,0,0.14)] py-10 text-center text-[13px] text-[var(--text-4)]">
                No logos yet — bulk-upload your files above, or add one at a time.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {assets.map((a, i) => (
                  <div key={i} className="flex gap-3 rounded-[10px] border border-[rgba(0,0,0,0.08)] p-3">
                    <div
                      className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)]"
                      style={{ background: a.background === "dark" ? "#0F172A" : "#fff" }}
                    >
                      {a.src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.src} alt="" className="h-full w-full object-contain p-1.5" />
                      ) : (
                        <span className="text-[9px] text-[var(--text-4)]">empty</span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <input
                        value={a.label}
                        onChange={(e) => update(i, { label: e.target.value })}
                        placeholder="Label"
                        className="app-input"
                        style={{ height: 32, fontSize: 12 }}
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          ref={(el) => {
                            fileInputs.current[i] = el;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void onReplace(i, e.target.files?.[0] ?? null);
                            e.currentTarget.value = "";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputs.current[i]?.click()}
                          className="rounded-[5px] border border-[var(--border-2)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--brand-700)] hover:bg-[var(--surface-1)]"
                        >
                          {a.src ? "Replace" : "Upload"}
                        </button>
                        <select
                          value={a.background ?? "light"}
                          onChange={(e) => update(i, { background: e.target.value as "light" | "dark" })}
                          className="app-select"
                          style={{ height: 28, fontSize: 11, paddingTop: 0, paddingBottom: 0 }}
                        >
                          <option value="light">Light</option>
                          <option value="dark">Dark</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          className="ml-auto text-[11px] font-medium text-[#DC2626] hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={add}
                className="rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-1.5 text-[12px] font-medium text-[var(--brand-700)] hover:bg-[var(--surface-1)]"
              >
                + Add one
              </button>
              <p className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                Stored inline — no hosting needed.
              </p>
            </div>

            {error && (
              <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] p-3 text-[12px] text-[#991B1B]">
                {error}
              </div>
            )}
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
    </div>
  );
}
