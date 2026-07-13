"use client";

// Studio — App Icons mode. Left: upload a transparent foreground (PNG/SVG), size it, set light +
// dark backgrounds (solid or gradient), toggle the tinted/monochrome layer + platforms. Right: the
// icon previewed in every shape (squircle / rounded / circle / square) across light, dark and
// tinted appearances. Download builds drop-in iOS + Android asset catalogs (see export-icons.ts).
// Hidden 1024px master nodes are the rasterization source. Client-side + autosaved to localStorage.

import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackgroundEditor, Slider } from "../controls";
import { btnPrimary, btnSecondary, Field, PanelHeader, SectionRule, Toggle } from "../studio-ui";
import { exportIcons } from "./export-icons";
import { IconArt } from "./icon-art";
import { ShapePreview } from "./shape-preview";
import { DEFAULT_ICON_STATE, SHAPES, STORAGE_KEY_ICONS, type BackgroundTheme, type IconState } from "./config";

function loadState(): IconState {
  if (typeof window === "undefined") return DEFAULT_ICON_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_ICONS);
    if (!raw) return DEFAULT_ICON_STATE;
    const parsed = JSON.parse(raw) as Partial<IconState>;
    return {
      ...DEFAULT_ICON_STATE,
      ...parsed,
      light: parsed.light ?? DEFAULT_ICON_STATE.light,
      dark: parsed.dark ?? DEFAULT_ICON_STATE.dark,
      platforms: { ...DEFAULT_ICON_STATE.platforms, ...(parsed.platforms ?? {}) },
    };
  } catch {
    return DEFAULT_ICON_STATE;
  }
}

const CHECKER =
  "repeating-conic-gradient(#e6e6ea 0% 25%, #ffffff 0% 50%) 50% / 16px 16px";

const MASTER = 1024;

export function IconsWorkspace() {
  const [state, setState] = useState<IconState>(DEFAULT_ICON_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY_ICONS, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const patch = useCallback((p: Partial<IconState>) => setState((s) => ({ ...s, ...p })), []);

  const onForeground = useCallback((file: File | null) => {
    if (!file) return setState((s) => ({ ...s, foreground: null }));
    const reader = new FileReader();
    reader.onload = () => setState((s) => ({ ...s, foreground: String(reader.result) }));
    reader.readAsDataURL(file);
  }, []);

  const register = useCallback((key: string, el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(key, el);
    else nodeRefs.current.delete(key);
  }, []);

  const appearances = useMemo(() => {
    const rows: { key: string; label: string; fill: BackgroundTheme["fill"]; grayscale?: boolean }[] = [
      { key: "light", label: "Light", fill: state.light.fill },
      { key: "dark", label: "Dark", fill: state.dark.fill },
    ];
    if (state.tinted) rows.push({ key: "tinted", label: "Tinted", fill: state.light.fill, grayscale: true });
    return rows;
  }, [state.light.fill, state.dark.fill, state.tinted]);

  const doDownload = useCallback(async () => {
    if (!state.foreground) return;
    const nodes: Record<string, HTMLElement> = {};
    for (const [k, el] of nodeRefs.current.entries()) nodes[k] = el;
    setBusy(true);
    setProgress({ done: 0, total: 1 });
    try {
      await document.fonts.ready;
      await exportIcons(nodes, { tinted: state.tinted, platforms: state.platforms }, (done, total) => setProgress({ done, total }));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [state.foreground, state.tinted, state.platforms]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* ── Control rail ── */}
      <aside className="widget-card flex w-full shrink-0 flex-col overflow-hidden lg:w-[380px]">
        <PanelHeader label="01 // CONTROLS" />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <Field label="App icon artwork" hint="transparent PNG or SVG">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-[var(--border-2)]" style={{ background: CHECKER }}>
                {state.foreground ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={state.foreground} alt="" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <ArrowDownTrayIcon className="h-5 w-5 rotate-180 text-[var(--text-4)]" />
                )}
              </div>
              <label className={btnSecondary + " cursor-pointer"}>
                {state.foreground ? "Replace" : "Upload"}
                <input type="file" accept="image/png,image/svg+xml,image/*" className="hidden" onChange={(e) => onForeground(e.target.files?.[0] ?? null)} />
              </label>
              {state.foreground ? (
                <button type="button" className="text-[12px] font-medium text-[var(--danger-500)]" onClick={() => onForeground(null)}>
                  Remove
                </button>
              ) : null}
            </div>
          </Field>

          <Slider label="Artwork size" value={state.fgScale} min={30} max={100} step={1} suffix="%" onChange={(v) => patch({ fgScale: v })} />

          <Field label="Platforms">
            <div className="space-y-2.5">
              <Toggle checked={state.platforms.ios} onChange={(v) => patch({ platforms: { ...state.platforms, ios: v } })} label="iOS (AppIcon.appiconset)" />
              <Toggle checked={state.platforms.android} onChange={(v) => patch({ platforms: { ...state.platforms, android: v } })} label="Android (adaptive + legacy)" />
            </div>
          </Field>

          <Toggle checked={state.tinted} onChange={(v) => patch({ tinted: v })} label="Tinted / monochrome layer" />

          <SectionRule label="Light background" />
          <BackgroundEditor theme={state.light} onChange={(t) => patch({ light: t })} />

          <SectionRule label="Dark background" />
          <BackgroundEditor theme={state.dark} onChange={(t) => patch({ dark: t })} />
        </div>
      </aside>

      {/* ── Preview + export ── */}
      <section className="widget-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-2)] px-5 py-3">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-3)]">02 // PREVIEW · LIGHT · DARK · SHAPES</span>
          <button type="button" className={btnPrimary} disabled={busy || !state.foreground || (!state.platforms.ios && !state.platforms.android)} onClick={doDownload}>
            <ArrowDownTrayIcon className="h-4 w-4" />
            {busy && progress ? `${progress.done}/${progress.total}…` : "Download catalogs"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface-canvas)] p-6">
          {!state.foreground ? (
            <p className="text-[13px] text-[var(--text-4)]">Upload a transparent app-icon artwork to preview it.</p>
          ) : (
            <div className="space-y-8">
              {appearances.map((ap) => (
                <div key={ap.key}>
                  <div className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">{ap.label}</div>
                  <div className="flex flex-wrap gap-6">
                    {SHAPES.map((shape) => (
                      <div key={shape.id} className="flex flex-col items-center gap-2">
                        <div className="rounded-[18px] p-2" style={{ background: CHECKER }}>
                          <ShapePreview size={112} fill={ap.fill} image={state.foreground} fgScale={state.fgScale} shape={shape.id} grayscale={ap.grayscale} />
                        </div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]">{shape.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Off-screen 1024px master render nodes — the rasterization source for export. Positioned
          far off-screen (not opacity:0, which html-to-image can otherwise bake into the capture). */}
      <div style={{ position: "fixed", left: -99999, top: 0, width: MASTER, height: MASTER, pointerEvents: "none" }} aria-hidden>
        <div ref={(el) => register("light", el)} style={{ width: MASTER, height: MASTER }}>
          <IconArt size={MASTER} fill={state.light.fill} image={state.foreground} fgScale={state.fgScale} layer="composite" />
        </div>
        <div ref={(el) => register("dark", el)} style={{ width: MASTER, height: MASTER }}>
          <IconArt size={MASTER} fill={state.dark.fill} image={state.foreground} fgScale={state.fgScale} layer="composite" />
        </div>
        <div ref={(el) => register("tinted", el)} style={{ width: MASTER, height: MASTER }}>
          <IconArt size={MASTER} fill={state.light.fill} image={state.foreground} fgScale={state.fgScale} layer="composite" grayscale />
        </div>
        <div ref={(el) => register("fg", el)} style={{ width: MASTER, height: MASTER }}>
          <IconArt size={MASTER} image={state.foreground} fgScale={state.fgScale} layer="foreground" />
        </div>
        <div ref={(el) => register("bg", el)} style={{ width: MASTER, height: MASTER }}>
          <IconArt size={MASTER} fill={state.light.fill} image={state.foreground} fgScale={state.fgScale} layer="background" />
        </div>
        <div ref={(el) => register("mono", el)} style={{ width: MASTER, height: MASTER }}>
          <IconArt size={MASTER} image={state.foreground} fgScale={state.fgScale} layer="mono" />
        </div>
      </div>
    </div>
  );
}
