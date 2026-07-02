"use client";

// Studio — the social-asset creator. Left: labelled controls (asset type · styles · platforms ·
// custom size · content). Right: a live grid of every artboard in the current view + a single
// Download action (PNG/JPEG · 1x/2x). All state is client-side and autosaved to localStorage;
// export is fully client-side (html-to-image + fflate). Admin/Super-Admin gated at the route/nav/
// middleware layer.

import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
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
      /* quota / private mode — ignore */
    }
  }, [state, hydrated]);

  const { assetType, content } = state;

  // ── State helpers ──
  const patch = useCallback((p: Partial<StudioState>) => setState((s) => ({ ...s, ...p })), []);
  const patchContent = useCallback(
    (p: Partial<StudioContent>) => setState((s) => ({ ...s, content: { ...s.content, ...p } })),
    [],
  );
  const updateSlide = useCallback((index: number, p: Partial<Slide>) => {
    setState((s) => ({
      ...s,
      content: { ...s.content, slides: s.content.slides.map((sl, i) => (i === index ? { ...sl, ...p } : sl)) },
    }));
  }, []);
  const addSlide = useCallback(() => {
    setState((s) => ({
      ...s,
      content: { ...s.content, slides: [...s.content.slides, { headline: "New slide", accent: "", body: "" }] },
    }));
  }, []);
  const removeSlide = useCallback((index: number) => {
    setState((s) =>
      s.content.slides.length <= 1
        ? s
        : { ...s, content: { ...s.content, slides: s.content.slides.filter((_, i) => i !== index) } },
    );
  }, []);
  const toggleIn = useCallback(<T,>(arr: T[], v: T): T[] => {
    const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    return next.length ? next : arr; // never allow empty
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

  // ── Build the artboards for the current view (styles × targets × slides) ──
  const boards = useMemo<Board[]>(() => {
    const slideCount = assetType === "carousel" ? content.slides.length : 1;
    const targets = state.custom.enabled
      ? [{ label: "Custom", slug: "custom", size: { w: state.custom.w, h: state.custom.h } }]
      : state.platforms.map((p) => ({
          label: PLATFORMS.find((x) => x.id === p)!.label,
          slug: p,
          size: SIZES[assetType][p],
        }));
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
        await exportAllZip(targets, state.format, state.scale, `gitwork-studio-${assetType}.zip`, (done, total) =>
          setProgress({ done, total }),
        );
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [boards, fileBase, state.format, state.scale, assetType]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* ── Controls ── */}
      <aside className="widget-card flex w-full shrink-0 flex-col overflow-hidden lg:w-[368px]">
        <PanelHeader label="01 // CONTROLS" />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <Field label="Asset type">
            <div className="grid grid-cols-4 gap-1 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
              {ASSET_TYPES.map((a) => (
                <TabButton key={a.id} active={a.id === assetType} onClick={() => patch({ assetType: a.id })}>
                  {a.label}
                </TabButton>
              ))}
            </div>
          </Field>

          <Field label="Styles" hint="one or more">
            <div className="grid grid-cols-2 gap-2">
              {ALL_STYLES.map((p) => (
                <ChoiceChip
                  key={p.id}
                  active={state.styles.includes(p.id)}
                  onClick={() => patch({ styles: toggleIn(state.styles, p.id) })}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                    style={{ background: p.bg, boxShadow: `inset 0 0 0 2px ${p.accent}` }}
                  />
                  {p.label}
                </ChoiceChip>
              ))}
            </div>
          </Field>

          <Field label="Platforms" hint={state.custom.enabled ? "off · using custom size" : "one or more"}>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((p) => (
                <ChoiceChip
                  key={p.id}
                  disabled={state.custom.enabled}
                  active={!state.custom.enabled && state.platforms.includes(p.id)}
                  onClick={() => patch({ platforms: toggleIn(state.platforms, p.id) })}
                >
                  {p.label}
                </ChoiceChip>
              ))}
            </div>
          </Field>

          <Field label="Custom size">
            <Toggle
              checked={state.custom.enabled}
              onChange={(v) => patch({ custom: { ...state.custom, enabled: v } })}
              label="Override platform sizes"
            />
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
            <select
              className="app-select w-full"
              value={content.wordmark}
              onChange={(e) => patchContent({ wordmark: e.target.value as WordmarkId })}
            >
              <option value="gitwork">Gitwork wordmark</option>
              <option value="foundry">Foundry wordmark</option>
              <option value="none">None</option>
            </select>
          </Field>

          <Field label="Logo" hint="optional — overrides wordmark">
            <div className="flex items-center gap-3">
              {content.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={content.logoDataUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-[6px] border border-[var(--border-2)] object-contain p-1"
                />
              ) : null}
              <label className="app-button-secondary cursor-pointer text-[12px]">
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
                onChange={(e) =>
                  assetType === "banner" ? patchContent({ tag: e.target.value }) : patchContent({ eyebrow: e.target.value })
                }
              />
            </Field>
          ) : null}

          {assetType === "carousel" ? (
            <Field label="Slides">
              <div className="space-y-3">
                {content.slides.map((sl, i) => (
                  <div key={i} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                        Slide {i + 1}
                      </span>
                      {content.slides.length > 1 ? (
                        <button
                          type="button"
                          className="text-[11px] font-medium text-[var(--danger-500)]"
                          onClick={() => removeSlide(i)}
                        >
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
            </Field>
          ) : assetType === "avatar" ? (
            <p className="text-[12px] leading-relaxed text-[var(--text-4)]">
              The avatar uses the brand mark above — the wordmark initial, or your uploaded logo if set.
            </p>
          ) : (
            <SlideFields slide={content.slides[0]} onChange={(p) => updateSlide(0, p)} />
          )}

          {assetType === "banner" ? (
            <Field label="Footnote">
              <input
                className="app-input w-full"
                value={content.footnote}
                placeholder="GLOBAL BUILD CAPACITY. UK QUALITY CONTROL."
                onChange={(e) => patchContent({ footnote: e.target.value })}
              />
            </Field>
          ) : null}

          {assetType === "carousel" || assetType === "post" ? (
            <Toggle
              checked={content.showDivider}
              onChange={(v) => patchContent({ showDivider: v })}
              label="Show divider line"
            />
          ) : null}
        </div>
      </aside>

      {/* ── Preview + export ── */}
      <section className="widget-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-2)] px-5 py-3">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-3)]">
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
            />
            <Segmented
              value={state.scale}
              options={[
                { value: 1, label: "1×" },
                { value: 2, label: "2×" },
              ]}
              onChange={(v) => patch({ scale: v })}
            />
            <button
              type="button"
              className="app-button-primary inline-flex items-center gap-1.5 text-[12px]"
              disabled={busy}
              onClick={doDownload}
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {busy && progress
                ? `${progress.done}/${progress.total}…`
                : boards.length > 1
                  ? `Download ${boards.length}`
                  : "Download"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-canvas)] p-5">
          {groups.map(([label, groupBoards]) => (
            <div key={label} className="mb-7">
              <div className="mb-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
                {label}
              </div>
              <div className="flex flex-wrap gap-4">
                {groupBoards.map((b) => (
                  <ArtboardCard
                    key={b.key}
                    board={b}
                    assetType={assetType}
                    content={content}
                    registerRef={registerRef}
                    onDownload={() => doExportOne(b)}
                    busy={busy}
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
  content,
  registerRef,
  onDownload,
  busy,
}: {
  board: Board;
  assetType: AssetTypeId;
  content: StudioContent;
  registerRef: (key: string, el: HTMLDivElement | null) => void;
  onDownload: () => void;
  busy: boolean;
}) {
  const maxW = 300;
  const maxH = 380;
  const scale = Math.min(maxW / board.size.w, maxH / board.size.h);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="group relative overflow-hidden rounded-[10px] border border-[var(--border-2)] shadow-sm"
        style={{ width: board.size.w * scale, height: board.size.h * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: board.size.w, height: board.size.h }}>
          <div ref={(el) => registerRef(board.key, el)} style={{ width: board.size.w, height: board.size.h }}>
            <ArtboardBody
              assetType={assetType}
              size={board.size}
              preset={board.preset}
              content={content}
              slideIndex={board.slideIndex}
              slideCount={board.slideCount}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          title="Download this image"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-[6px] border border-black/10 bg-white/85 text-[var(--text-1)] opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-white disabled:opacity-0"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
        </button>
      </div>
      {board.slideCount > 1 ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]">
          Slide {board.slideIndex + 1}
        </span>
      ) : null}
    </div>
  );
}

// ── Presentational helpers ──
function PanelHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-[var(--border-2)] px-5 py-3">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-3)]">{label}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]">{label}</span>
        {hint ? <span className="text-[10px] lowercase tracking-normal text-[var(--text-4)]">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-4)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--border-2)]" />
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
        <textarea
          className="app-input min-h-[76px] w-full resize-y"
          value={slide.body}
          onChange={(e) => onChange({ body: e.target.value })}
        />
      </Field>
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      className="app-input w-full"
      value={value}
      min={100}
      max={5000}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(5000, Math.max(100, Math.round(n))));
      }}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--text-2)]">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          "relative h-[22px] w-[38px] shrink-0 rounded-full transition " +
          (checked ? "bg-[var(--brand-700)]" : "bg-[var(--border-1)]")
        }
      >
        <span
          className={
            "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all " + (checked ? "left-[19px]" : "left-[3px]")
          }
        />
      </button>
      {label}
    </label>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-[5px] px-1 py-1.5 text-[11px] font-medium transition " +
        (active ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm" : "text-[var(--text-3)] hover:text-[var(--text-1)]")
      }
    >
      {children}
    </button>
  );
}

function ChoiceChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[12px] font-medium transition disabled:opacity-40 " +
        (active
          ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
          : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)] hover:border-[var(--border-1)]")
      }
    >
      {children}
    </button>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              "rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition " +
              (active ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm" : "text-[var(--text-3)] hover:text-[var(--text-1)]")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
