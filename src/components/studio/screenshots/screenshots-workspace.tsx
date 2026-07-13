"use client";

// Studio — App Screenshots mode. Left: control rail (store targets · layout · background · device ·
// status bar · scenes with screen upload + text layers). Right: a live, zoomable grid of every
// scene × target + a single Download (PNG/JPEG, EXACT store size at 1×). All state is client-side,
// autosaved to localStorage; export reuses the shared html-to-image + fflate pipeline. Admin/Super-
// Admin gated at the route/nav/middleware layer (same `studio` permission as Social mode).

import { ArrowDownTrayIcon, ChevronDownIcon, ChevronUpIcon, MinusIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exportAllZip, exportOne } from "../export";
import { BackgroundEditor, ColorField, Slider } from "../controls";
import { brandBackgroundSwatches, useStudioBrand } from "../brand";
import { btnPrimary, btnSecondary, Field, IconBtn, PanelHeader, SectionRule, Segmented, Toggle } from "../studio-ui";
import { Scene } from "./scene";
import {
  CANVAS_PRESETS,
  DEFAULT_SCREENSHOT_STATE,
  DEVICES,
  FONT_OPTIONS,
  LAYOUT_PRESETS,
  STORAGE_KEY_SHOTS,
  STORE_LABEL,
  canvasById,
  fillBase,
  layoutById,
  newScene,
  newTextLayer,
  type Fill,
  type DeviceId,
  type LayoutId,
  type ScreenshotState,
  type Scene as SceneModel,
  type TextLayer as TextLayerModel,
} from "./config";

function loadState(): ScreenshotState {
  if (typeof window === "undefined") return DEFAULT_SCREENSHOT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SHOTS);
    if (!raw) return DEFAULT_SCREENSHOT_STATE;
    const parsed = JSON.parse(raw) as Partial<ScreenshotState>;
    return {
      ...DEFAULT_SCREENSHOT_STATE,
      ...parsed,
      deviceConfig: { ...DEFAULT_SCREENSHOT_STATE.deviceConfig, ...(parsed.deviceConfig ?? {}), bodyColor: { ...DEFAULT_SCREENSHOT_STATE.deviceConfig.bodyColor, ...(parsed.deviceConfig?.bodyColor ?? {}) } },
      statusBar: { ...DEFAULT_SCREENSHOT_STATE.statusBar, ...(parsed.statusBar ?? {}) },
      background: parsed.background ?? DEFAULT_SCREENSHOT_STATE.background,
      targets: parsed.targets?.length ? parsed.targets.filter((t) => CANVAS_PRESETS.some((c) => c.id === t)) : DEFAULT_SCREENSHOT_STATE.targets,
      scenes: parsed.scenes?.length ? parsed.scenes : DEFAULT_SCREENSHOT_STATE.scenes,
    };
  } catch {
    return DEFAULT_SCREENSHOT_STATE;
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "screenshot";
}

interface SBoard {
  key: string;
  targetId: string;
  scene: SceneModel;
  sceneIndex: number;
}

export function ScreenshotsWorkspace() {
  const [state, setState] = useState<ScreenshotState>(DEFAULT_SCREENSHOT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [openScene, setOpenScene] = useState(0);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { brand } = useStudioBrand();
  const brandSwatches = brand.source === "client" ? brandBackgroundSwatches(brand) : undefined;
  const defaultTextFont = brand.source === "client" ? brand.fontIds.display : "serif-dm";

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY_SHOTS, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const patch = useCallback((p: Partial<ScreenshotState>) => setState((s) => ({ ...s, ...p })), []);
  const updateScene = useCallback(
    (id: string, p: Partial<SceneModel>) => setState((s) => ({ ...s, scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, ...p } : sc)) })),
    [],
  );
  const updateText = useCallback((sceneId: string, textId: string, p: Partial<TextLayerModel>) => {
    setState((s) => ({
      ...s,
      scenes: s.scenes.map((sc) => (sc.id === sceneId ? { ...sc, texts: sc.texts.map((t) => (t.id === textId ? { ...t, ...p } : t)) } : sc)),
    }));
  }, []);

  // Switching layout rearranges the whole scene: the device moves (Scene reads state.layout), and
  // every text layer is re-anchored to the new layout's text zone. Multiple layers stack downward
  // within the zone so they don't overlap. Fine-tune afterwards with the per-layer X/Y sliders.
  const setLayout = useCallback((layout: LayoutId) => {
    setState((s) => {
      const zone = layoutById(layout).textZone;
      return {
        ...s,
        layout,
        scenes: s.scenes.map((sc) => ({
          ...sc,
          texts: sc.texts.map((t, i) => ({
            ...t,
            xPct: zone.xPct,
            yPct: Math.min(92, Math.max(2, zone.yPct + i * 14)),
            align: zone.align,
            widthPct: zone.widthPct ?? t.widthPct,
          })),
        })),
      };
    });
  }, []);

  const toggleTarget = useCallback((id: string) => {
    setState((s) => {
      const next = s.targets.includes(id) ? s.targets.filter((t) => t !== id) : [...s.targets, id];
      return { ...s, targets: next.length ? next : s.targets };
    });
  }, []);

  const addScene = useCallback(() => {
    setState((s) => {
      const sc = newScene(s.layout);
      setOpenScene(s.scenes.length);
      return { ...s, scenes: [...s.scenes, sc] };
    });
  }, []);
  const removeScene = useCallback((id: string) => {
    setState((s) => (s.scenes.length <= 1 ? s : { ...s, scenes: s.scenes.filter((sc) => sc.id !== id) }));
  }, []);
  const onSceneImage = useCallback(
    (id: string, file: File | null) => {
      if (!file) return updateScene(id, { screenImage: null });
      const reader = new FileReader();
      reader.onload = () => updateScene(id, { screenImage: String(reader.result) });
      reader.readAsDataURL(file);
    },
    [updateScene],
  );
  const addText = useCallback(
    (sceneId: string) => setState((s) => ({ ...s, scenes: s.scenes.map((sc) => (sc.id === sceneId ? { ...sc, texts: [...sc.texts, newTextLayer(s.layout, { text: "New text", font: defaultTextFont })] } : sc)) })),
    [defaultTextFont],
  );
  const removeText = useCallback(
    (sceneId: string, textId: string) => setState((s) => ({ ...s, scenes: s.scenes.map((sc) => (sc.id === sceneId ? { ...sc, texts: sc.texts.filter((t) => t.id !== textId) } : sc)) })),
    [],
  );
  const moveText = useCallback((sceneId: string, index: number, dir: -1 | 1) => {
    setState((s) => ({
      ...s,
      scenes: s.scenes.map((sc) => {
        if (sc.id !== sceneId) return sc;
        const j = index + dir;
        if (j < 0 || j >= sc.texts.length) return sc;
        const texts = [...sc.texts];
        [texts[index], texts[j]] = [texts[j], texts[index]];
        return { ...sc, texts };
      }),
    }));
  }, []);

  const selectedTargets = useMemo(() => state.targets.map((id) => canvasById(id)), [state.targets]);
  const devicesInPlay = useMemo(() => {
    const set = new Set<DeviceId>();
    for (const c of selectedTargets) if (c.framed && c.device) set.add(c.device);
    return [...set];
  }, [selectedTargets]);
  const anyFramed = devicesInPlay.length > 0;

  const boards = useMemo<SBoard[]>(() => {
    const out: SBoard[] = [];
    for (const targetId of state.targets) {
      state.scenes.forEach((scene, i) => out.push({ key: `${targetId}__${scene.id}`, targetId, scene, sceneIndex: i }));
    }
    return out;
  }, [state.targets, state.scenes]);

  const groups = useMemo(() => {
    const map = new Map<string, SBoard[]>();
    for (const b of boards) (map.get(b.targetId) ?? map.set(b.targetId, []).get(b.targetId)!).push(b);
    return [...map.entries()].map(([targetId, bs]) => ({ canvas: canvasById(targetId), boards: bs }));
  }, [boards]);

  const registerRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(key, el);
    else nodeRefs.current.delete(key);
  }, []);

  const fileBase = useCallback(
    (b: SBoard) => {
      const c = canvasById(b.targetId);
      const base = slug(b.scene.texts[0]?.text || `app-${c.store}`);
      return `${base}__${c.store}__${c.id}-${c.w}x${c.h}__s${b.sceneIndex + 1}`;
    },
    [],
  );
  const bgOf = useCallback((b: SBoard) => fillBase((b.scene.bgOverride ?? state.background).fill), [state.background]);

  const doExportOne = useCallback(
    async (b: SBoard) => {
      const node = nodeRefs.current.get(b.key);
      if (!node) return;
      setBusy(true);
      try {
        await document.fonts.ready;
        await exportOne({ filename: fileBase(b), node, background: bgOf(b) }, state.format, 1);
      } finally {
        setBusy(false);
      }
    },
    [fileBase, bgOf, state.format],
  );

  const doDownload = useCallback(async () => {
    const targets = boards
      .map((b) => ({ filename: fileBase(b), node: nodeRefs.current.get(b.key), background: bgOf(b) }))
      .filter((t): t is { filename: string; node: HTMLDivElement; background: string } => Boolean(t.node));
    if (!targets.length) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      if (targets.length === 1) {
        await exportOne(targets[0], state.format, 1);
      } else {
        setProgress({ done: 0, total: targets.length });
        await exportAllZip(targets, state.format, 1, "gitwork-studio-screenshots.zip", (done, total) => setProgress({ done, total }));
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [boards, fileBase, bgOf, state.format]);

  const setZoomClamped = (v: number) => setZoom(Math.min(3, Math.max(0.5, Math.round(v * 100) / 100)));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* ── Control rail ── */}
      <aside className="widget-card flex w-full shrink-0 flex-col overflow-hidden lg:w-[380px]">
        <PanelHeader label="01 // CONTROLS" />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <Field label="Store targets" hint={`${state.targets.length} selected`}>
            <TargetPicker selected={state.targets} onToggle={toggleTarget} />
          </Field>

          <Field label="Layout" hint={anyFramed ? undefined : "feature graphic only"}>
            <select
              className="app-select w-full"
              value={state.layout}
              disabled={!anyFramed}
              onChange={(e) => setLayout(e.target.value as LayoutId)}
            >
              {LAYOUT_PRESETS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>

          <SectionRule label="Background" />
          <BackgroundEditor theme={state.background} onChange={(t) => patch({ background: t })} swatches={brandSwatches} />

          {anyFramed ? (
            <>
              <SectionRule label="Device" />
              {devicesInPlay.map((d) => (
                <Field key={d} label={`${DEVICES[d].label} colour`}>
                  <div className="flex flex-wrap gap-2">
                    {DEVICES[d].bodyColors.map((c) => {
                      const active = state.deviceConfig.bodyColor[d] === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          title={c.label}
                          onClick={() => patch({ deviceConfig: { ...state.deviceConfig, bodyColor: { ...state.deviceConfig.bodyColor, [d]: c.id } } })}
                          className={"h-8 w-8 rounded-full border transition " + (active ? "ring-2 ring-[var(--brand-600)] ring-offset-1 ring-offset-[var(--surface-0)] border-transparent" : "border-[var(--border-1)] hover:border-[var(--text-4)]")}
                          style={{ backgroundColor: c.body }}
                        />
                      );
                    })}
                  </div>
                </Field>
              ))}
              <Slider label="Device scale" value={state.deviceConfig.scale} min={0.6} max={1.4} step={0.02} suffix="×" onChange={(v) => patch({ deviceConfig: { ...state.deviceConfig, scale: v } })} />
              <Slider label="Vertical nudge" value={state.deviceConfig.offsetY} min={-0.3} max={0.3} step={0.01} onChange={(v) => patch({ deviceConfig: { ...state.deviceConfig, offsetY: v } })} />
              <Slider label="Rotation" value={state.deviceConfig.rotation} min={-20} max={20} step={1} suffix="°" onChange={(v) => patch({ deviceConfig: { ...state.deviceConfig, rotation: v } })} />

              <SectionRule label="Status bar" />
              <Toggle checked={state.statusBar.on} onChange={(v) => patch({ statusBar: { ...state.statusBar, on: v } })} label="Show status bar" />
              {state.statusBar.on ? (
                <div className="flex flex-wrap gap-2">
                  <Segmented value={state.statusBar.style} options={[{ value: "ios", label: "iOS" }, { value: "android", label: "Android" }]} onChange={(v) => patch({ statusBar: { ...state.statusBar, style: v } })} />
                  <Segmented value={state.statusBar.tint} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} onChange={(v) => patch({ statusBar: { ...state.statusBar, tint: v } })} />
                </div>
              ) : null}
            </>
          ) : null}

          <SectionRule label="Scenes" />
          <div className="space-y-2">
            {state.scenes.map((sc, i) => (
              <SceneCard
                key={sc.id}
                index={i}
                scene={sc}
                open={openScene === i}
                canRemove={state.scenes.length > 1}
                onToggle={() => setOpenScene(openScene === i ? -1 : i)}
                onImage={(f) => onSceneImage(sc.id, f)}
                onChange={(p) => updateScene(sc.id, p)}
                onRemove={() => removeScene(sc.id)}
                onAddText={() => addText(sc.id)}
                onUpdateText={(tid, p) => updateText(sc.id, tid, p)}
                onRemoveText={(tid) => removeText(sc.id, tid)}
                onMoveText={(idx, dir) => moveText(sc.id, idx, dir)}
                swatches={brandSwatches}
              />
            ))}
            <button type="button" className={btnSecondary + " w-full"} onClick={addScene}>
              <PlusIcon className="h-4 w-4" /> Add scene
            </button>
          </div>
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
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]">exact 1×</span>
            <Segmented value={state.format} options={[{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }]} onChange={(v) => patch({ format: v })} />
            <button type="button" className={btnPrimary} disabled={busy || !boards.length} onClick={doDownload}>
              <ArrowDownTrayIcon className="h-4 w-4" />
              {busy && progress ? `${progress.done}/${progress.total}…` : boards.length > 1 ? `Download ${boards.length}` : "Download"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface-canvas)] p-5">
          {groups.length === 0 ? (
            <p className="text-[13px] text-[var(--text-4)]">Select at least one store target to preview.</p>
          ) : (
            groups.map(({ canvas, boards: gb }) => (
              <div key={canvas.id} className="mb-8">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
                    {STORE_LABEL[canvas.store]} · {canvas.label} · {canvas.w}×{canvas.h}
                  </span>
                  {gb.length > canvas.maxShots ? (
                    <span className="font-mono text-[10px] text-[var(--danger-500)]">exceeds {canvas.maxShots}-shot max</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-5">
                  {gb.map((b) => (
                    <SceneCardPreview key={b.key} board={b} state={state} zoom={zoom} registerRef={registerRef} onDownload={() => doExportOne(b)} onUpload={(f) => onSceneImage(b.scene.id, f)} busy={busy} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

// ── Preview card ──
function SceneCardPreview({
  board,
  state,
  zoom,
  registerRef,
  onDownload,
  onUpload,
  busy,
}: {
  board: SBoard;
  state: ScreenshotState;
  zoom: number;
  registerRef: (key: string, el: HTMLDivElement | null) => void;
  onDownload: () => void;
  onUpload: (f: File | null) => void;
  busy: boolean;
}) {
  const canvas = canvasById(board.targetId);
  const maxW = 300 * zoom;
  const maxH = 560 * zoom;
  const scale = Math.min(maxW / canvas.w, maxH / canvas.h);
  const needsImage = canvas.framed ? state.layout !== "feature" : true;
  return (
    <div className="flex flex-col gap-2">
      <div
        className="group relative overflow-hidden rounded-[12px] border border-[var(--border-2)] shadow-sm transition hover:border-[var(--border-1)]"
        style={{ width: canvas.w * scale, height: canvas.h * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: canvas.w, height: canvas.h }}>
          <div ref={(el) => registerRef(board.key, el)} style={{ width: canvas.w, height: canvas.h }}>
            <Scene state={state} scene={board.scene} canvasId={board.targetId} />
          </div>
        </div>
        {!board.scene.screenImage && needsImage ? (
          <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 bg-black/30 text-white opacity-0 backdrop-blur-[1px] transition group-hover:opacity-100">
            <ArrowDownTrayIcon className="h-5 w-5 rotate-180" />
            <span className="text-[11px] font-medium">Upload screenshot</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
          </label>
        ) : null}
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
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]">Scene {board.sceneIndex + 1}</span>
    </div>
  );
}

// ── Scene control card ──
function SceneCard({
  index,
  scene,
  open,
  canRemove,
  onToggle,
  onImage,
  onChange,
  onRemove,
  onAddText,
  onUpdateText,
  onRemoveText,
  onMoveText,
  swatches,
}: {
  index: number;
  scene: SceneModel;
  open: boolean;
  canRemove: boolean;
  onToggle: () => void;
  onImage: (f: File | null) => void;
  onChange: (p: Partial<SceneModel>) => void;
  onRemove: () => void;
  onAddText: () => void;
  onUpdateText: (textId: string, p: Partial<TextLayerModel>) => void;
  onRemoveText: (textId: string) => void;
  onMoveText: (index: number, dir: -1 | 1) => void;
  swatches?: { label: string; fill: Fill }[];
}) {
  const [openText, setOpenText] = useState<string | null>(null);
  return (
    <div className={"overflow-hidden rounded-[12px] border bg-[var(--surface-0)] transition " + (open ? "border-[var(--brand-300)]" : "border-[var(--border-2)] hover:border-[var(--border-1)]")}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">S{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-1)]">{scene.texts[0]?.text?.split("\n")[0] || "Untitled scene"}</span>
        <span className="shrink-0 font-mono text-[10px] text-[var(--text-4)]">{scene.screenImage ? "IMG" : "no img"}</span>
        <ChevronDownIcon className={"h-4 w-4 shrink-0 text-[var(--text-4)] transition " + (open ? "rotate-180" : "")} />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-[var(--border-2)] p-3">
          <Field label="Screenshot" hint="drops into the frame">
            <div className="flex items-center gap-3">
              {scene.screenImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scene.screenImage} alt="" className="h-12 w-12 shrink-0 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-dashed border-[var(--border-1)] text-[var(--text-4)]">
                  <ArrowDownTrayIcon className="h-4 w-4 rotate-180" />
                </div>
              )}
              <label className={btnSecondary + " cursor-pointer"}>
                {scene.screenImage ? "Replace" : "Upload"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onImage(e.target.files?.[0] ?? null)} />
              </label>
              {scene.screenImage ? (
                <button type="button" className="text-[12px] font-medium text-[var(--danger-500)]" onClick={() => onImage(null)}>
                  Remove
                </button>
              ) : null}
            </div>
          </Field>

          <Field label="Text layers" hint={`${scene.texts.length}`}>
            <div className="space-y-2">
              {scene.texts.map((t, ti) => (
                <TextLayerCard
                  key={t.id}
                  layer={t}
                  index={ti}
                  count={scene.texts.length}
                  open={openText === t.id}
                  onToggle={() => setOpenText(openText === t.id ? null : t.id)}
                  onChange={(p) => onUpdateText(t.id, p)}
                  onRemove={() => onRemoveText(t.id)}
                  onMove={(dir) => onMoveText(ti, dir)}
                />
              ))}
              <button type="button" className={btnSecondary + " w-full"} onClick={onAddText}>
                <PlusIcon className="h-4 w-4" /> Add text
              </button>
            </div>
          </Field>

          <Toggle
            checked={Boolean(scene.bgOverride)}
            onChange={(v) => onChange({ bgOverride: v ? { fill: { kind: "solid", color: "#0A1533" } } : null })}
            label="Override background for this scene"
          />
          {scene.bgOverride ? <BackgroundEditor theme={scene.bgOverride} onChange={(t) => onChange({ bgOverride: t })} swatches={swatches} /> : null}

          {canRemove ? (
            <button type="button" onClick={onRemove} className="text-[11px] font-medium text-[var(--danger-500)] hover:underline">
              Remove scene
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Text layer editor ──
function TextLayerCard({
  layer,
  index,
  count,
  open,
  onToggle,
  onChange,
  onRemove,
  onMove,
}: {
  layer: TextLayerModel;
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<TextLayerModel>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className={"overflow-hidden rounded-[10px] border bg-[var(--surface-1)] transition " + (open ? "border-[var(--brand-300)]" : "border-[var(--border-2)]")}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 truncate text-left text-[12px] text-[var(--text-1)]">
          {layer.text.split("\n")[0] || "Empty"}
        </button>
        <IconBtn onClick={() => onMove(-1)} aria="Move up">
          <ChevronUpIcon className={"h-3.5 w-3.5 " + (index === 0 ? "opacity-30" : "")} />
        </IconBtn>
        <IconBtn onClick={() => onMove(1)} aria="Move down">
          <ChevronDownIcon className={"h-3.5 w-3.5 " + (index === count - 1 ? "opacity-30" : "")} />
        </IconBtn>
        <IconBtn onClick={onRemove} aria="Remove text">
          <TrashIcon className="h-3.5 w-3.5 text-[var(--danger-500)]" />
        </IconBtn>
      </div>
      {open ? (
        <div className="space-y-3 border-t border-[var(--border-2)] p-3">
          <textarea className="app-input min-h-[64px] w-full resize-y" value={layer.text} onChange={(e) => onChange({ text: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Font">
              <select className="app-select w-full" value={layer.font} onChange={(e) => onChange({ font: e.target.value })}>
                {FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Align">
              <Segmented full value={layer.align} options={[{ value: "left", label: "L" }, { value: "center", label: "C" }, { value: "right", label: "R" }]} onChange={(v) => onChange({ align: v })} />
            </Field>
          </div>
          <Slider label="Size" value={layer.sizePx} min={24} max={160} step={2} onChange={(v) => onChange({ sizePx: v })} />
          <Slider label="Weight" value={layer.weight} min={300} max={800} step={100} onChange={(v) => onChange({ weight: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Colour">
              <ColorField value={layer.color} onChange={(c) => onChange({ color: c })} />
            </Field>
            <Field label="Width">
              <Slider value={layer.widthPct} min={30} max={100} step={2} suffix="%" onChange={(v) => onChange({ widthPct: v })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Slider label="X" value={layer.xPct} min={0} max={100} step={1} suffix="%" onChange={(v) => onChange({ xPct: v })} />
            <Slider label="Y" value={layer.yPct} min={0} max={100} step={1} suffix="%" onChange={(v) => onChange({ yPct: v })} />
          </div>
          <Slider label="Rotation" value={layer.rotation} min={-45} max={45} step={1} suffix="°" onChange={(v) => onChange({ rotation: v })} />

          <Toggle checked={layer.shadow.on} onChange={(v) => onChange({ shadow: { ...layer.shadow, on: v } })} label="Drop shadow" />
          {layer.shadow.on ? (
            <div className="grid grid-cols-3 gap-2">
              <Slider label="X" value={layer.shadow.x} min={-40} max={40} step={1} onChange={(v) => onChange({ shadow: { ...layer.shadow, x: v } })} />
              <Slider label="Y" value={layer.shadow.y} min={-40} max={40} step={1} onChange={(v) => onChange({ shadow: { ...layer.shadow, y: v } })} />
              <Slider label="Blur" value={layer.shadow.blur} min={0} max={80} step={1} onChange={(v) => onChange({ shadow: { ...layer.shadow, blur: v } })} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Store-target multi-select ──
function TargetPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const byStore = useMemo(() => {
    const m = new Map<string, typeof CANVAS_PRESETS>();
    for (const c of CANVAS_PRESETS) {
      const list = m.get(c.store) ?? [];
      list.push(c);
      m.set(c.store, list);
    }
    return [...m.entries()];
  }, []);
  return (
    <div className="space-y-3">
      {byStore.map(([store, list]) => (
        <div key={store}>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]">{STORE_LABEL[store as "appstore" | "play"]}</div>
          <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
            {list.map((c) => {
              const active = selected.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => onToggle(c.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-[var(--surface-1)]">
                  <span className={"flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border " + (active ? "border-[var(--brand-700)] bg-[var(--brand-700)] text-white" : "border-[var(--border-1)]")}>
                    {active ? <span className="text-[10px] leading-none">✓</span> : null}
                  </span>
                  <span className="flex-1 text-[13px] text-[var(--text-1)]">{c.label}</span>
                  <span className="font-mono text-[10px] text-[var(--text-4)]">{c.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

