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
  { id: "care", label: "Care", href: "/demo/care", icon: LifebuoyIcon, description: "Client support — triage conversations from every channel in one place." },
  { id: "studio", label: "Studio", href: "/demo/studio", icon: SwatchIcon, description: "Create on-brand social assets — carousels, banners, posts and avatars." },
  { id: "backstage", label: "Backstage", href: "/demo/backstage", icon: BuildingOffice2Icon, description: "Internal ops — leave booking, expenses, and staffing alerts." },
];

export const BRAND_KEY = "gitwork.demo.brand";
export const MODULES_KEY = "gitwork.demo.modules";

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

/** Build a shareable demo URL. Omits `modules` when every module is enabled. */
export function buildDemoLink(origin: string, client: string, enabledIds: string[]): string {
  const params = new URLSearchParams();
  const trimmed = client.trim();
  if (trimmed) params.set("client", trimmed);
  if (enabledIds.length && enabledIds.length < DEMO_MODULES.length) {
    // Preserve canonical order.
    const ordered = DEMO_MODULES.filter((m) => enabledIds.includes(m.id)).map((m) => m.id);
    params.set("modules", ordered.join(","));
  }
  const qs = params.toString();
  return `${origin}/demo${qs ? `?${qs}` : ""}`;
}
