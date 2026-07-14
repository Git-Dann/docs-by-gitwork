"use client";

/**
 * Single source of truth for the demo suite's modules + the white-label config
 * (client name + which modules are enabled). Shared by the demo sidebar
 * (DemoShell), the demo hub, and the Settings → Demo configurator, so all three
 * agree on ids, labels, order, and how config travels in the URL / localStorage.
 *
 * Config travels two ways:
 *   • URL params on /demo — `?client=Acme&modules=dev,docs,portal` (shareable).
 *   • localStorage — a URL param persists so it survives client-side navigation
 *     (nav links don't carry the query).
 */

import {
  HomeIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  UsersIcon,
  LifebuoyIcon,
  SwatchIcon,
  BuildingOffice2Icon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

export type DemoModule = {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  description: string;
};

export const DEMO_MODULES: DemoModule[] = [
  { id: "dev", label: "Foundry HQ", href: "/demo/dev", icon: HomeIcon, description: "A developer's day — standup, tasks due, meetings, and the client roster." },
  { id: "devsignal", label: "Code", href: "/demo/devsignal", icon: CodeBracketIcon, description: "Vet a candidate with automated GitHub signal, a timed challenge, and a video screen." },
  { id: "docs", label: "Docs", href: "/demo/docs", icon: DocumentTextIcon, description: "Handovers, reports and briefs — the documents a developer works with day to day." },
  { id: "portal", label: "Portal", href: "/demo/portal", icon: UsersIcon, description: "A client's page — tasks, wiki, and the shared timeline they see." },
  { id: "wiki", label: "Wiki", href: "/demo/wiki", icon: BookOpenIcon, description: "The client's knowledge base — architecture, brand & design system, changelog and monitors." },
  { id: "care", label: "Care", href: "/demo/care", icon: LifebuoyIcon, description: "Client support — triage conversations from every channel in one place." },
  { id: "studio", label: "Studio", href: "/demo/studio", icon: SwatchIcon, description: "Create on-brand social assets — carousels, banners, posts and avatars." },
  { id: "backstage", label: "Backstage", href: "/demo/backstage", icon: BuildingOffice2Icon, description: "Internal ops — leave booking, expenses, and staffing alerts." },
];

export const BRAND_KEY = "gitwork.demo.brand";
export const MODULES_KEY = "gitwork.demo.modules";
export const COLOR_KEY = "gitwork.demo.color";

/** Foundry's default accent (—brand-600/700), shown as the colour-picker default. */
export const DEFAULT_BRAND_COLOR = "#1D4ED8";

/** Strict hex validation — also guards against CSS injection via the `color` param. */
export function isHexColor(v: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v.trim());
}

/** Resolve the brand accent colour: URL `?color=` (persisted) → localStorage → null (Foundry blue). */
export function readDemoColor(): string | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("color");
  if (param !== null) {
    const v = param.trim();
    if (isHexColor(v)) {
      window.localStorage.setItem(COLOR_KEY, v);
      return v;
    }
    window.localStorage.removeItem(COLOR_KEY); // invalid / `?color=` clears it
    return null;
  }
  const stored = window.localStorage.getItem(COLOR_KEY);
  return stored && isHexColor(stored) ? stored : null;
}

/** Derive a full light-mode `--brand-*` scale from one hex, keeping tints light. Returns the CSS
 *  declaration body for a `:root { … }` override (empty string when the hex is invalid). */
export function brandCssVars(hex: string): string {
  if (!isHexColor(hex)) return "";
  const H = hex.trim();
  const mixW = (pct: number) => `color-mix(in srgb, ${H} ${pct}%, white)`;
  const mixB = (pct: number) => `color-mix(in srgb, ${H}, black ${pct}%)`;
  return [
    `--brand-600:${H}`,
    `--brand-700:${H}`,
    `--brand-500:${mixW(90)}`,
    `--brand-400:${mixW(78)}`,
    `--brand-300:${mixW(32)}`,
    `--brand-200:${mixW(16)}`,
    `--brand-100:${mixW(16)}`,
    `--brand-50:${mixW(8)}`,
    `--brand-800:${mixB(22)}`,
    `--brand-900:${mixB(22)}`,
    `--surface-brand:${mixW(8)}`,
    `--surface-brand-soft:${mixW(6)}`,
    `--surface-brand-strong:${mixW(16)}`,
    `--accent:${H}`,
  ].join(";") + ";";
}

/** Resolve the enabled module ids: URL `?modules=` (persisted) → localStorage → null (all). */
export function readDemoModules(): string[] | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("modules");
  if (param !== null) {
    const ids = param.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length) window.localStorage.setItem(MODULES_KEY, ids.join(","));
    else window.localStorage.removeItem(MODULES_KEY); // `?modules=` clears the filter
    return ids.length ? ids : null;
  }
  const stored = window.localStorage.getItem(MODULES_KEY);
  return stored ? stored.split(",").filter(Boolean) : null;
}

/** Filter the module list by the enabled-ids set (null = all, order preserved). */
export function filterModules(enabled: string[] | null): DemoModule[] {
  if (!enabled) return DEMO_MODULES;
  return DEMO_MODULES.filter((m) => enabled.includes(m.id));
}

/** `/demo/*` segments that are real routes — a client name matching one of these can't sit in the
 *  path (it'd resolve to that page), so it falls back to the `?client=` query form. */
const RESERVED_SEGMENTS = new Set<string>([...DEMO_MODULES.map((m) => m.id), "tasks", "vet"]);

/** Build a shareable demo URL. The client name rides in the PATH (`/demo/SWG`) so the link reads
 *  as the client's own — falling back to `?client=` only when the name collides with a route
 *  segment. Omits `modules` when every module is enabled, and `color` when it's the Foundry
 *  default / invalid. */
export function buildDemoLink(
  origin: string,
  client: string,
  enabledIds: string[],
  color?: string | null,
): string {
  const params = new URLSearchParams();
  const trimmed = client.trim();
  const inPath = trimmed && !RESERVED_SEGMENTS.has(trimmed.toLowerCase());
  if (trimmed && !inPath) params.set("client", trimmed); // reserved-name → query fallback
  if (enabledIds.length && enabledIds.length < DEMO_MODULES.length) {
    // Preserve canonical order.
    const ordered = DEMO_MODULES.filter((m) => enabledIds.includes(m.id)).map((m) => m.id);
    params.set("modules", ordered.join(","));
  }
  if (color && isHexColor(color) && color.toUpperCase() !== DEFAULT_BRAND_COLOR) {
    params.set("color", color);
  }
  const qs = params.toString();
  const base = inPath ? `${origin}/demo/${encodeURIComponent(trimmed)}` : `${origin}/demo`;
  return `${base}${qs ? `?${qs}` : ""}`;
}
