"use client";

import type { OsApp } from "@/lib/demo/os/window-manager";

export interface OsAppMeta {
  app: OsApp;
  /** Name under the dock icon and in the menu bar. */
  label: string;
  /** Title-bar text. */
  title: string;
}

/** Dock order. Trash is drawn separately at the end, after the divider, as on a Mac. */
export const DOCK_APPS: OsAppMeta[] = [
  { app: "finder", label: "Work", title: "Work — things we've shipped" },
  { app: "foundry", label: "Foundry", title: "Foundry" },
  { app: "services", label: "Plans", title: "Plans & pricing" },
  { app: "notes", label: "Notes", title: "Notes" },
  { app: "calendar", label: "Calendar", title: "Book a free 30-min audit" },
  { app: "mail", label: "Mail", title: "New Message" },
  { app: "terminal", label: "Terminal", title: "gitwork — zsh" },
  { app: "settings", label: "System Settings", title: "System Settings" },
];

export const TRASH: OsAppMeta = { app: "trash", label: "Trash", title: "Trash" };
export const ABOUT: OsAppMeta = { app: "about", label: "About This Mac", title: "" };

export function appMeta(app: OsApp): OsAppMeta {
  if (app === "trash") return TRASH;
  if (app === "about") return ABOUT;
  return DOCK_APPS.find((a) => a.app === app)!;
}

export { AppIcon } from "./os-icons";

/** Gitwork's wordmark dot-G, used where a Mac shows the Apple logo. */
export function GitworkMark({ size = 16, colour = "currentColor" }: { size?: number; colour?: string }) {
  return (
    <span aria-hidden className="inline-flex items-baseline font-[family-name:var(--font-display)] leading-none" style={{ fontSize: size, color: colour }}>
      G<span style={{ color: "#818CF8" }}>.</span>
    </span>
  );
}
