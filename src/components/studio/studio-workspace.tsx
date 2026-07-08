"use client";

// Studio — the social-asset creator. Left: a modern control rail (asset type · styles · platforms ·
// custom size · content). Right: a live, zoomable grid of every artboard + a single Download action
// (PNG/JPEG · 1x/2x). All state is client-side and autosaved to localStorage; export is fully
// client-side (html-to-image + fflate). Admin/Super-Admin gated at the route/nav/middleware layer.

import { ArrowDownTrayIcon, CheckIcon, ChevronDownIcon, MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
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
  type StylePreset,
  type StylePresetId,
  type WordmarkId,
} from "./config";
import { exportAllZip, exportOne } from "./export";
import { btnPrimary, btnSecondary, Field, IconBtn, NumberInput, PanelHeader, SectionRule, Segmented, Toggle } from "./studio-ui";
import { ArtboardBody } from "./templates";

interface StudioState {
  assetType: AssetTypeId;
  platforms: PlatformId[];
  styles: StylePresetId[];
  content: StudioContent;
  custom: { enabled: boolean; w: number; h: number };
  format: ExportFormat;
  scale: ExportScale;
}

const ALL_STYLES = Object.values(STYLE_PRESETS);

const DEFAULT_STATE: StudioState = {
  assetType: "carousel",
  platforms: ["instagram"],
  styles: ["navy"],
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
    const parsed = JSON.parse(raw) as Partial<StudioState> & { presetId?: StylePresetId };
    const styles = parsed.styles?.length ? parsed.styles : parsed.presetId ? [parsed.presetId] : DEFAULT_STATE.styles;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      styles,
      content: { ...DEFAULT_CONTENT, ...(parsed.content ?? {}) },
      custom: { ...DEFAULT_STATE.custom, ...(parsed.custom ?? {}) },
      platforms: parsed.platforms?.length ? parsed.platforms : DEFAULT_STATE.platforms,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "asset";
}

interface Board {
  key: string;
  preset: StylePreset;
  groupKey: string;
  size: Size;
  targetSlug: string;
  slideIndex: number;
  slideCount: number;
}

export function StudioWorkspace() {
  const [state, setState] = useState<StudioState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [editingSlide, setEditingSlide] = useState(0);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const { assetType, content } = state;

  const patch = useCallback((p: Partial<StudioState>) => setState((s) => ({ ...s, ...p })), []);
  const patchContent = useCallback(
    (p: Partial<StudioContent>) => setState((s) => ({ ...s, content: { ...s.content, ...p } })),
    [],
  );
  const updateSlide = useCallback((index: number, p: Partial<Slide>) => {
    setState((s) => ({ ...s, content: { ...s.content, slides: s.content.slides.map((sl, i) => (i === index ? { ...sl, ...p } : sl)) } }));
  }, []);
  const addSlide = useCallback(() => {
    setEditingSlide(content.slides.length); // open the new slide
    setState((s) => ({ ...s, content: { ...s.content, slides: [...s.content.slides, { headline: "New slide", accent: "", body: "" }] } }));
  }, [content.slides.length]);
  const removeSlide = useCallback((index: number) => {
    setState((s) => (s.content.slides.length <= 1 ? s : { ...s, content: { ...s.content, slides: s.content.slides.filter((_, i) => i !== index) } }));
    setEditingSlide((cur) => (cur === index ? -1 : cur > index ? cur - 1 : cur));
  }, []);
  const toggleIn = useCallback(<T,>(arr: T[], v: T): T[] => {
    const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    return next.length ? next : arr;
  }, []);
  const onLogo = useCallback(
    (file: File | null) => {
      if (!file) return patchContent({ logoDataUrl: null });
      const reader = new FileReader();
      reader.onload = () => patchContent({ logoDataUrl: String(reader.result) });
      reader.readAsDataURL(file);
    },
    [patchContent],
  );

  const boards = useMemo<Board[]>(() => {
    const slideCount = assetType === "carousel" ? content.slides.length : 1;
    const targets = state.custom.enabled
      ? [{ label: "Custom", slug: "custom", size: { w: state.custom.w, h: state.custom.h } }]
      : state.platforms.map((p) => ({ label: PLATFORMS.find((x) => x.id === p)!.label, slug: p, size: SIZES[assetType][p] }));
    const out: Board[] = [];
    for (const styleId of state.styles) {
      const preset = STYLE_PRESETS[styleId];
      for (const t of targets) {
        for (let i = 0; i < slideCount; i++) {
          out.push({
            key: `${styleId}-${t.slug}-${i}`,
            preset,
            targetSlug: t.slug,
            groupKey: `${preset.label} · ${t.label} · ${t.size.w}×${t.size.h}`,
            size: t.size,
            slideIndex: i,
            slideCount,
          });
        }
      }
    }
    return out;
  }, [assetType, content.slides.length, state.platforms, state.styles, state.custom]);

  const groups = useMemo(() => {
    const map = new Map<string, Board[]>();
    for (const b of boards) (map.get(b.groupKey) ?? map.set(b.groupKey, []).get(b.groupKey)!).push(b);
    return [...map.entries()];
  }, [boards]);

  const registerRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(key, el);
    else nodeRefs.current.delete(key);
  }, []);

  const fileBase = useCallback(
    (b: Board) => {
      const base = slug(content.eyebrow || `gitwork-${assetType}`);
      const slide = b.slideCount > 1 ? `__s${b.slideIndex + 1}` : "";
      return `${base}__${assetType}__${b.preset.id}__${b.targetSlug}-${b.size.w}x${b.size.h}${slide}`;
    },
    [content.eyebrow, assetType],
  );

  const doExportOne = useCallback(
    async (b: Board) => {
      const node = nodeRefs.current.get(b.key);
      if (!node) return;
      setBusy(true);
      try {
        await document.fonts.ready;
        await exportOne({ filename: fileBase(b), node, background: b.preset.bg }, state.format, state.scale);
      } finally {
        setBusy(false);
      }
    },
    [fileBase, state.format, state.scale],
  );

  const doDownload = useCallback(async () => {
    const targets = boards
      .map((b) => ({ filename: fileBase(b), node: nodeRefs.current.get(b.key), background: b.preset.bg }))
      .filter((t): t is { filename: string; node: HTMLDivElement; background: string } => Boolean(t.node));
    if (!targets.length) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      if (targets.length === 1) {
        await exportOne(targets[0], state.format, state.scale);
      } else {
        setProgress({ done: 0, total: targets.length });
        await exportAllZip(targets, state.format, state.scale, `gitwork-studio-${assetType}.zip`, (done, total) => setProgress({ done, total }));
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [boards, fileBase, state.format, state.scale, assetType]);

  const setZoomClamped = (v: number) => setZoom(Math.min(3, Math.max(0.5, Math.round(v * 100) / 100)));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* ── Control rail ── */}
      <aside className="widget-card flex w-full shrink-0 flex-col overflow-hidden lg:w-[360px]">
        <PanelHeader label="01 // CONTROLS" />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <Field label="Platforms" hint={state.custom.enabled ? "custom size on" : "one or more"}>
            <PlatformDropdown
              assetType={assetType}
              selected={state.platforms}
              disabled={state.custom.enabled}
              onToggle={(id) => patch({ platforms: toggleIn(state.platforms, id) })}
            />
          </Field>

          <Field label="Asset type">
            <Segmented
              full
              value={assetType}
              options={ASSET_TYPES.map((a) => ({ value: a.id, label: a.label }))}
              onChange={(v) => patch({ assetType: v })}
            />
          </Field>

          <Field label="Style" hint="one or more">
            <div className="grid grid-cols-2 gap-2.5">
              {ALL_STYLES.map((p) => (
                <StyleCard key={p.id} preset={p} active={state.styles.includes(p.id)} onClick={() => patch({ styles: toggleIn(state.styles, p.id) })} />
              ))}
            </div>
          </Field>

          <Field label="Custom size">
            <Toggle checked={state.custom.enabled} onChange={(v) => patch({ custom: { ...state.custom, enabled: v } })} label="Override platform sizes" />
            {state.custom.enabled ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Width">
                  <NumberInput value={state.custom.w} onChange={(w) => patch({ custom: { ...state.custom, w } })} />
                </Field>
                <Field label="Height">
                  <NumberInput value={state.custom.h} onChange={(h) => patch({ custom: { ...state.custom, h } })} />
                </Field>
              </div>
            ) : null}
          </Field>

          <SectionRule label="Content" />

          <Field label="Brand mark">
            <select className="app-select w-full" value={content.wordmark} onChange={(e) => patchContent({ wordmark: e.target.value as WordmarkId })}>
              <option value="gitwork">Gitwork wordmark</option>
              <option value="foundry">Foundry wordmark</option>
              <option value="none">None</option>
            </select>
          </Field>

          <Field label="Logo" hint="optional — overrides wordmark">
            <div className="flex items-center gap-3">
              {content.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={content.logoDataUrl} alt="" className="h-10 w-10 shrink-0 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] object-contain p-1" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-dashed border-[var(--border-1)] text-[var(--text-4)]">
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </div>
              )}
              <label className={btnSecondary + " cursor-pointer"}>
                {content.logoDataUrl ? "Replace" : "Upload"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
              </label>
              {content.logoDataUrl ? (
                <button type="button" className="text-[12px] font-medium text-[var(--danger-500)]" onClick={() => onLogo(null)}>
                  Remove
                </button>
              ) : null}
            </div>
          </Field>

          {assetType !== "avatar" ? (
            <Field label={assetType === "banner" ? "Tag pill" : "Eyebrow"}>
              <input
                className="app-input w-full"
                value={assetType === "banner" ? content.tag : content.eyebrow}
                placeholder={assetType === "banner" ? "SUPPORTING THE PROMPTWARE BUILDERS" : "CASE STUDY / CLIENT"}
                onChange={(e) => (assetType === "banner" ? patchContent({ tag: e.target.value }) : patchContent({ eyebrow: e.target.value }))}
              />
            </Field>
          ) : null}

          {assetType === "carousel" ? (
            <Field label="Slides" hint={`${content.slides.length}`}>
              <div className="space-y-2">
                {content.slides.map((sl, i) => (
                  <SlideCard
                    key={i}
                    index={i}
                    slide={sl}
                    preset={STYLE_PRESETS[state.styles[0]]}
                    open={editingSlide === i}
                    canRemove={content.slides.length > 1}
                    onToggle={() => setEditingSlide(editingSlide === i ? -1 : i)}
                    onChange={(p) => updateSlide(i, p)}
                    onRemove={() => removeSlide(i)}
                  />
                ))}
                <button type="button" className={btnSecondary + " w-full"} onClick={addSlide}>
                  <PlusIcon className="h-4 w-4" /> Add slide
                </button>
              </div>
            </Field>
          ) : assetType === "avatar" ? (
            <p className="text-[12px] leading-relaxed text-[var(--text-4)]">The avatar uses the brand mark above — the wordmark initial, or your uploaded logo if set.</p>
          ) : (
            <SlideFields slide={content.slides[0]} onChange={(p) => updateSlide(0, p)} />
          )}

          {assetType === "banner" ? (
            <Field label="Footnote">
              <input className="app-input w-full" value={content.footnote} placeholder="GLOBAL BUILD CAPACITY. UK QUALITY CONTROL." onChange={(e) => patchContent({ footnote: e.target.value })} />
            </Field>
          ) : null}

          {assetType === "carousel" || assetType === "post" ? (
            <div className="space-y-3 border-t border-[var(--border-3)] pt-4">
              <Toggle checked={content.showTopBar} onChange={(v) => patchContent({ showTopBar: v })} label="Accent bar (top)" />
              <Toggle checked={content.showDivider} onChange={(v) => patchContent({ showDivider: v })} label="Divider line" />
            </div>
          ) : null}
        </div>
      </aside>

      {/* ── Preview + export ── */}
      <section className="widget-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-2)] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-3)]">
              02 // PREVIEW · {boards.length} {boards.length === 1 ? "IMAGE" : "IMAGES"}
            </span>
            <div className="flex items-center gap-0.5 rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
              <IconBtn onClick={() => setZoomClamped(zoom - 0.25)} aria="Zoom out">
                <MinusIcon className="h-3.5 w-3.5" />
              </IconBtn>
              <span className="w-11 text-center font-mono text-[11px] tabular-nums text-[var(--text-2)]">{Math.round(zoom * 100)}%</span>
              <IconBtn onClick={() => setZoomClamped(zoom + 0.25)} aria="Zoom in">
                <PlusIcon className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={state.format} options={[{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }]} onChange={(v) => patch({ format: v })} />
            <Segmented value={state.scale} options={[{ value: 1, label: "1×" }, { value: 2, label: "2×" }]} onChange={(v) => patch({ scale: v })} />
            <button type="button" className={btnPrimary} disabled={busy} onClick={doDownload}>
              <ArrowDownTrayIcon className="h-4 w-4" />
              {busy && progress ? `${progress.done}/${progress.total}…` : boards.length > 1 ? `Download ${boards.length}` : "Download"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface-canvas)] p-5">
          {groups.map(([label, groupBoards]) => (
            <div key={label} className="mb-8">
              <div className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">{label}</div>
              <div className="flex flex-wrap gap-5">
                {groupBoards.map((b) => (
                  <ArtboardCard key={b.key} board={b} assetType={assetType} content={content} zoom={zoom} registerRef={registerRef} onDownload={() => doExportOne(b)} busy={busy} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Artboard preview card ──
function ArtboardCard({
  board,
  assetType,
  content,
  zoom,
  registerRef,
  onDownload,
  busy,
}: {
  board: Board;
  assetType: AssetTypeId;
  content: StudioContent;
  zoom: number;
  registerRef: (key: string, el: HTMLDivElement | null) => void;
  onDownload: () => void;
  busy: boolean;
}) {
  const maxW = 380 * zoom;
  const maxH = 500 * zoom;
  const scale = Math.min(maxW / board.size.w, maxH / board.size.h);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="group relative overflow-hidden rounded-[12px] border border-[var(--border-2)] shadow-sm transition hover:border-[var(--border-1)]"
        style={{ width: board.size.w * scale, height: board.size.h * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: board.size.w, height: board.size.h }}>
          <div ref={(el) => registerRef(board.key, el)} style={{ width: board.size.w, height: board.size.h }}>
            <ArtboardBody assetType={assetType} size={board.size} preset={board.preset} content={content} slideIndex={board.slideIndex} slideCount={board.slideCount} />
          </div>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          title="Download this image"
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-[8px] border border-black/10 bg-white/90 text-[var(--text-1)] opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-white disabled:opacity-0"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
        </button>
      </div>
      {board.slideCount > 1 ? <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]">Slide {board.slideIndex + 1}</span> : null}
    </div>
  );
}

// ── Presentational primitives (social-specific; generic ones live in studio-ui.tsx) ──
function StyleCard({ preset, active, onClick }: { preset: StylePreset; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative flex flex-col gap-2 rounded-[12px] border p-2 text-left transition " +
        (active ? "border-[var(--brand-600)] ring-1 ring-[var(--brand-600)]" : "border-[var(--border-2)] hover:border-[var(--border-1)]")
      }
    >
      <span className="flex h-11 items-center gap-2 rounded-[8px] px-2.5" style={{ backgroundColor: preset.bg }}>
        <span style={{ fontFamily: preset.serif, color: preset.ink, fontSize: 17, lineHeight: 1 }}>Aa</span>
        <span className="ml-auto h-3.5 w-3.5 rounded-full" style={{ backgroundColor: preset.accent }} />
      </span>
      <span className="px-0.5 text-[12px] font-medium text-[var(--text-2)]">{preset.label}</span>
      {active ? (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-700)] text-white">
          <CheckIcon className="h-3 w-3" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

function PlatformDropdown({
  assetType,
  selected,
  disabled,
  onToggle,
}: {
  assetType: AssetTypeId;
  selected: PlatformId[];
  disabled?: boolean;
  onToggle: (id: PlatformId) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    selected.length === 0
      ? "None"
      : selected.length === PLATFORMS.length
        ? "All platforms"
        : PLATFORMS.filter((p) => selected.includes(p.id)).map((p) => p.label).join(", ");
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-0)] px-3 py-2.5 text-[13px] text-[var(--text-1)] transition hover:border-[var(--text-4)] disabled:opacity-40"
      >
        <span className="truncate text-left">{disabled ? "Custom size active" : summary}</span>
        <ChevronDownIcon className={"h-4 w-4 shrink-0 text-[var(--text-4)] transition " + (open ? "rotate-180" : "")} />
      </button>
      {open && !disabled ? (
        <div className="mt-1.5 overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)]">
          {PLATFORMS.map((p) => {
            const active = selected.includes(p.id);
            const sz = SIZES[assetType][p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggle(p.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--surface-1)]"
              >
                <span
                  className={
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border " +
                    (active ? "border-[var(--brand-700)] bg-[var(--brand-700)] text-white" : "border-[var(--border-1)]")
                  }
                >
                  {active ? <CheckIcon className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <span className="flex-1 text-[13px] text-[var(--text-1)]">{p.label}</span>
                <span className="font-mono text-[10px] text-[var(--text-4)]">
                  {sz.w}×{sz.h}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SlideCard({
  index,
  slide,
  preset,
  open,
  canRemove,
  onToggle,
  onChange,
  onRemove,
}: {
  index: number;
  slide: Slide;
  preset: StylePreset;
  open: boolean;
  canRemove: boolean;
  onToggle: () => void;
  onChange: (p: Partial<Slide>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={
        "overflow-hidden rounded-[12px] border bg-[var(--surface-0)] transition " +
        (open ? "border-[var(--brand-300)]" : "border-[var(--border-2)] hover:border-[var(--border-1)]")
      }
    >
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
          S{index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate" style={{ fontFamily: preset.serif, fontSize: 13, color: "var(--text-1)" }}>
          {slide.headline || "Untitled"}
          {slide.accent ? <span style={{ color: preset.accent }}> {slide.accent}</span> : null}
        </span>
        <ChevronDownIcon className={"h-4 w-4 shrink-0 text-[var(--text-4)] transition " + (open ? "rotate-180" : "")} />
      </button>
      {open ? (
        <div className="border-t border-[var(--border-2)] p-3">
          <SlideFields slide={slide} onChange={onChange} />
          {canRemove ? (
            <button type="button" onClick={onRemove} className="mt-3 text-[11px] font-medium text-[var(--danger-500)] hover:underline">
              Remove slide
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SlideFields({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Headline">
        <input className="app-input w-full" value={slide.headline} onChange={(e) => onChange({ headline: e.target.value })} />
      </Field>
      <Field label="Accent phrase" hint="coloured">
        <input className="app-input w-full" value={slide.accent} onChange={(e) => onChange({ accent: e.target.value })} />
      </Field>
      <Field label="Body">
        <textarea className="app-input min-h-[80px] w-full resize-y" value={slide.body} onChange={(e) => onChange({ body: e.target.value })} />
      </Field>
    </div>
  );
}
