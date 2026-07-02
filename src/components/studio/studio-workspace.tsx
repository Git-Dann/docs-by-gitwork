"use client";

// Studio — the social-asset creator. Left: controls (asset type · platforms · style · content ·
// custom size). Right: a live grid of every artboard in the current view + a sticky export bar
// (PNG/JPEG · 1x/2x · download all as .zip). All state is client-side and autosaved to
// localStorage; export is fully client-side (html-to-image + fflate). Admin/Super-Admin gated
// at the route/nav/middleware layer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASSET_TYPES,
  DEFAULT_CONTENT,
  PLATFORMS,
  SIZES,
  STORAGE_KEY,
  STYLE_PRESETS,
  type AssetTypeId,
  type ExportFormat,
  type ExportScale,
  type PlatformId,
  type Size,
  type Slide,
  type StudioContent,
  type StylePresetId,
  type WordmarkId,
} from "./config";
import { exportAllZip, exportOne } from "./export";
import { ArtboardBody } from "./templates";

interface StudioState {
  assetType: AssetTypeId;
  platforms: PlatformId[];
  presetId: StylePresetId;
  content: StudioContent;
  custom: { enabled: boolean; w: number; h: number };
  format: ExportFormat;
  scale: ExportScale;
}

const DEFAULT_STATE: StudioState = {
  assetType: "carousel",
  platforms: ["instagram"],
  presetId: "navy",
  content: DEFAULT_CONTENT,
  custom: { enabled: false, w: 1080, h: 1080 },
  format: "png",
  scale: 2,
};

function loadState(): StudioState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<StudioState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      content: { ...DEFAULT_CONTENT, ...(parsed.content ?? {}) },
      custom: { ...DEFAULT_STATE.custom, ...(parsed.custom ?? {}) },
      platforms: parsed.platforms?.length ? parsed.platforms : DEFAULT_STATE.platforms,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "asset"
  );
}

interface Board {
  key: string;
  groupLabel: string;
  groupSlug: string;
  size: Size;
  slideIndex: number;
  slideCount: number;
}

export function StudioWorkspace() {
  const [state, setState] = useState<StudioState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  // Autosave.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota / private mode — ignore */
    }
  }, [state, hydrated]);

  const preset = STYLE_PRESETS[state.presetId];
  const { assetType, content } = state;

  // ── State helpers ──
  const patch = useCallback((p: Partial<StudioState>) => setState((s) => ({ ...s, ...p })), []);
  const patchContent = useCallback(
    (p: Partial<StudioContent>) => setState((s) => ({ ...s, content: { ...s.content, ...p } })),
    [],
  );
  const updateSlide = useCallback((index: number, p: Partial<Slide>) => {
    setState((s) => {
      const slides = s.content.slides.map((sl, i) => (i === index ? { ...sl, ...p } : sl));
      return { ...s, content: { ...s.content, slides } };
    });
  }, []);
  const addSlide = useCallback(() => {
    setState((s) => ({
      ...s,
      content: { ...s.content, slides: [...s.content.slides, { headline: "New slide", accent: "", body: "" }] },
    }));
  }, []);
  const removeSlide = useCallback((index: number) => {
    setState((s) => {
      if (s.content.slides.length <= 1) return s;
      return { ...s, content: { ...s.content, slides: s.content.slides.filter((_, i) => i !== index) } };
    });
  }, []);
  const togglePlatform = useCallback((id: PlatformId) => {
    setState((s) => {
      const has = s.platforms.includes(id);
      const next = has ? s.platforms.filter((p) => p !== id) : [...s.platforms, id];
      return { ...s, platforms: next.length ? next : s.platforms };
    });
  }, []);

  const onLogo = useCallback(
    (file: File | null) => {
      if (!file) {
        patchContent({ logoDataUrl: null });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => patchContent({ logoDataUrl: String(reader.result) });
      reader.readAsDataURL(file);
    },
    [patchContent],
  );

  // ── Build the artboards for the current view ──
  const boards = useMemo<Board[]>(() => {
    const slideCount = assetType === "carousel" ? content.slides.length : 1;
    const targets: { label: string; slug: string; size: Size }[] = state.custom.enabled
      ? [{ label: "Custom", slug: "custom", size: { w: state.custom.w, h: state.custom.h } }]
      : state.platforms.map((p) => ({
          label: PLATFORMS.find((x) => x.id === p)!.label,
          slug: p,
          size: SIZES[assetType][p],
        }));
    const out: Board[] = [];
    for (const t of targets) {
      for (let i = 0; i < slideCount; i++) {
        out.push({
          key: `${t.slug}-${i}`,
          groupLabel: t.label,
          groupSlug: t.slug,
          size: t.size,
          slideIndex: i,
          slideCount,
        });
      }
    }
    return out;
  }, [assetType, content.slides.length, state.platforms, state.custom]);

  const registerRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(key, el);
    else nodeRefs.current.delete(key);
  }, []);

  const fileBase = useCallback(
    (b: Board) => {
      const base = slug(content.eyebrow || `gitwork-${state.assetType}`);
      const slide = b.slideCount > 1 ? `__s${b.slideIndex + 1}` : "";
      return `${base}__${state.assetType}__${b.groupSlug}-${b.size.w}x${b.size.h}${slide}`;
    },
    [content.eyebrow, state.assetType],
  );

  const doExportOne = useCallback(
    async (b: Board) => {
      const node = nodeRefs.current.get(b.key);
      if (!node) return;
      setBusy(true);
      try {
        await document.fonts.ready;
        await exportOne({ filename: fileBase(b), node, background: preset.bg }, state.format, state.scale);
      } finally {
        setBusy(false);
      }
    },
    [fileBase, preset.bg, state.format, state.scale],
  );

  const doExportAll = useCallback(async () => {
    const targets = boards
      .map((b) => ({ filename: fileBase(b), node: nodeRefs.current.get(b.key), background: preset.bg }))
      .filter((t): t is { filename: string; node: HTMLDivElement; background: string } => Boolean(t.node));
    if (!targets.length) return;
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    try {
      await document.fonts.ready;
      await exportAllZip(targets, state.format, state.scale, `gitwork-studio-${state.assetType}.zip`, (done, total) =>
        setProgress({ done, total }),
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [boards, fileBase, preset.bg, state.format, state.scale, state.assetType]);

  // Group boards by target for the grid.
  const groups = useMemo(() => {
    const map = new Map<string, Board[]>();
    for (const b of boards) {
      const arr = map.get(b.groupLabel) ?? [];
      arr.push(b);
      map.set(b.groupLabel, arr);
    }
    return [...map.entries()];
  }, [boards]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* ── Controls ── */}
      <aside className="widget-card flex w-full shrink-0 flex-col overflow-hidden lg:w-[340px]">
        <StudioHeader label="01 // CONTROLS" />
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <ControlBlock label="Asset type">
            <Segmented
              value={assetType}
              options={ASSET_TYPES.map((a) => ({ value: a.id, label: a.label }))}
              onChange={(v) => patch({ assetType: v })}
            />
          </ControlBlock>

          <ControlBlock label="Style">
            <Segmented
              value={state.presetId}
              options={Object.values(STYLE_PRESETS).map((p) => ({ value: p.id, label: p.label }))}
              onChange={(v) => patch({ presetId: v })}
            />
          </ControlBlock>

          <ControlBlock label="Platforms" hint={state.custom.enabled ? "Disabled while custom size is on" : undefined}>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => {
                const active = state.platforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={state.custom.enabled}
                    onClick={() => togglePlatform(p.id)}
                    className={
                      "rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition disabled:opacity-40 " +
                      (active
                        ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
                        : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)] hover:bg-[var(--surface-1)]")
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </ControlBlock>

          <ControlBlock label="Custom size">
            <label className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={state.custom.enabled}
                onChange={(e) => patch({ custom: { ...state.custom, enabled: e.target.checked } })}
              />
              Use a custom canvas size
            </label>
            {state.custom.enabled ? (
              <div className="mt-2 flex items-center gap-2">
                <NumberInput
                  value={state.custom.w}
                  onChange={(w) => patch({ custom: { ...state.custom, w } })}
                  aria-label="Custom width"
                />
                <span className="text-[var(--text-4)]">×</span>
                <NumberInput
                  value={state.custom.h}
                  onChange={(h) => patch({ custom: { ...state.custom, h } })}
                  aria-label="Custom height"
                />
              </div>
            ) : null}
          </ControlBlock>

          {/* ── Content ── */}
          <div className="border-t border-[var(--border-3)] pt-4">
            <ControlBlock label="Brand mark">
              <select
                className="app-select"
                value={content.wordmark}
                onChange={(e) => patchContent({ wordmark: e.target.value as WordmarkId })}
              >
                <option value="gitwork">Gitwork wordmark</option>
                <option value="foundry">Foundry wordmark</option>
                <option value="none">None</option>
              </select>
              <div className="mt-2 flex items-center gap-2">
                <label className="app-button-secondary cursor-pointer text-[12px]">
                  {content.logoDataUrl ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onLogo(e.target.files?.[0] ?? null)}
                  />
                </label>
                {content.logoDataUrl ? (
                  <button type="button" className="text-[12px] text-[var(--danger-500)]" onClick={() => onLogo(null)}>
                    Remove
                  </button>
                ) : null}
              </div>
            </ControlBlock>

            {assetType !== "avatar" ? (
              <ControlBlock label={assetType === "banner" ? "Tag pill" : "Eyebrow"}>
                <input
                  className="app-input"
                  value={assetType === "banner" ? content.tag : content.eyebrow}
                  placeholder={assetType === "banner" ? "SUPPORTING THE PROMPTWARE BUILDERS" : "CASE STUDY / CLIENT"}
                  onChange={(e) =>
                    assetType === "banner" ? patchContent({ tag: e.target.value }) : patchContent({ eyebrow: e.target.value })
                  }
                />
              </ControlBlock>
            ) : null}

            {assetType === "carousel" ? (
              <div className="space-y-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">Slides</div>
                {content.slides.map((sl, i) => (
                  <div key={i} className="rounded-[8px] border border-[var(--border-2)] p-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[var(--text-3)]">Slide {i + 1}</span>
                      {content.slides.length > 1 ? (
                        <button type="button" className="text-[11px] text-[var(--danger-500)]" onClick={() => removeSlide(i)}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <SlideFields slide={sl} onChange={(p) => updateSlide(i, p)} />
                  </div>
                ))}
                <button type="button" className="app-button-secondary w-full text-[12px]" onClick={addSlide}>
                  + Add slide
                </button>
              </div>
            ) : assetType === "avatar" ? (
              <p className="text-[12px] text-[var(--text-4)]">
                The avatar uses the brand mark above. Upload a logo to use it instead of the initial.
              </p>
            ) : (
              <SlideFields slide={content.slides[0]} onChange={(p) => updateSlide(0, p)} />
            )}

            {assetType === "banner" ? (
              <ControlBlock label="Footnote">
                <input
                  className="app-input"
                  value={content.footnote}
                  placeholder="GLOBAL BUILD CAPACITY. UK QUALITY CONTROL."
                  onChange={(e) => patchContent({ footnote: e.target.value })}
                />
              </ControlBlock>
            ) : null}

            {assetType === "carousel" || assetType === "post" ? (
              <label className="mt-3 flex items-center gap-2 text-[13px] text-[var(--text-2)]">
                <input
                  type="checkbox"
                  checked={content.showDivider}
                  onChange={(e) => patchContent({ showDivider: e.target.checked })}
                />
                Show divider line
              </label>
            ) : null}
          </div>
        </div>
      </aside>

      {/* ── Preview + export ── */}
      <section className="widget-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-2)] px-4 py-2.5">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-3)]">
            02 // PREVIEW · {boards.length} {boards.length === 1 ? "IMAGE" : "IMAGES"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={state.format}
              options={[
                { value: "png", label: "PNG" },
                { value: "jpeg", label: "JPEG" },
              ]}
              onChange={(v) => patch({ format: v })}
              small
            />
            <Segmented
              value={state.scale}
              options={[
                { value: 1, label: "1×" },
                { value: 2, label: "2×" },
              ]}
              onChange={(v) => patch({ scale: v })}
              small
            />
            <button type="button" className="app-button-primary text-[12px]" disabled={busy} onClick={doExportAll}>
              {busy && progress ? `Exporting ${progress.done}/${progress.total}…` : `Download all (.zip)`}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-canvas)] p-4">
          {groups.map(([label, groupBoards]) => (
            <div key={label} className="mb-6">
              <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
                {label} · {groupBoards[0].size.w}×{groupBoards[0].size.h}
              </div>
              <div className="flex flex-wrap gap-4">
                {groupBoards.map((b) => (
                  <ArtboardCard
                    key={b.key}
                    board={b}
                    assetType={assetType}
                    preset={preset}
                    content={content}
                    registerRef={registerRef}
                    onExport={() => doExportOne(b)}
                    busy={busy}
                    format={state.format}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Artboard preview card (true-size node kept for export) ──
function ArtboardCard({
  board,
  assetType,
  preset,
  content,
  registerRef,
  onExport,
  busy,
  format,
}: {
  board: Board;
  assetType: AssetTypeId;
  preset: (typeof STYLE_PRESETS)[StylePresetId];
  content: StudioContent;
  registerRef: (key: string, el: HTMLDivElement | null) => void;
  onExport: () => void;
  busy: boolean;
  format: ExportFormat;
}) {
  const maxW = 300;
  const maxH = 380;
  const scale = Math.min(maxW / board.size.w, maxH / board.size.h);
  return (
    <div className="group flex flex-col gap-1.5">
      <div
        className="overflow-hidden rounded-[8px] border border-[var(--border-2)] shadow-sm"
        style={{ width: board.size.w * scale, height: board.size.h * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: board.size.w, height: board.size.h }}>
          <div ref={(el) => registerRef(board.key, el)} style={{ width: board.size.w, height: board.size.h }}>
            <ArtboardBody
              assetType={assetType}
              size={board.size}
              preset={preset}
              content={content}
              slideIndex={board.slideIndex}
              slideCount={board.slideCount}
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onExport}
        disabled={busy}
        className="self-start font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)] transition hover:text-[var(--brand-700)] disabled:opacity-40"
      >
        ↓ {format}
      </button>
    </div>
  );
}

// ── Small presentational helpers ──
function StudioHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-[var(--border-2)] px-4 py-2.5">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-3)]">{label}</span>
    </div>
  );
}

function ControlBlock({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">{label}</span>
        {hint ? <span className="text-[10px] text-[var(--text-4)]">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function SlideFields({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  return (
    <div className="space-y-2">
      <input
        className="app-input"
        value={slide.headline}
        placeholder="Headline"
        onChange={(e) => onChange({ headline: e.target.value })}
      />
      <input
        className="app-input"
        value={slide.accent}
        placeholder="Accent phrase (coloured)"
        onChange={(e) => onChange({ accent: e.target.value })}
      />
      <textarea
        className="app-input min-h-[72px] resize-y"
        value={slide.body}
        placeholder="Body copy"
        onChange={(e) => onChange({ body: e.target.value })}
      />
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  ...rest
}: {
  value: number;
  onChange: (n: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      type="number"
      className="app-input w-24"
      value={value}
      min={100}
      max={5000}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(5000, Math.max(100, Math.round(n))));
      }}
      {...rest}
    />
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  small,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              (small ? "px-2 py-1 text-[11px] " : "px-2.5 py-1 text-[12px] ") +
              "rounded-[4px] font-medium transition " +
              (active
                ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm"
                : "text-[var(--text-3)] hover:text-[var(--text-1)]")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
