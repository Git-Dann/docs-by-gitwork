"use client";

/**
 * Standalone Foundry Studio demo (`/demo/studio`). Renders the real `StudioRoot` — the on-brand
 * social-asset creator. Studio is fully client-side (presets + localStorage, no API/session).
 *
 * We seed Studio's content from the white-label brand set on the /demo hub (falling back to a
 * fictional client), with generic copy — so the demo reads the client's name instead of the
 * built-in Gitwork/FELLAS sample. Colours still come from the selected brand preset.
 */

import { useState } from "react";
import { StudioRoot } from "@/components/studio/studio-root";
import { DemoShell } from "@/components/demo/demo-shell";

const STUDIO_KEY = "gitwork.studio.v1";
const BRAND_KEY = "gitwork.demo.brand";

export function DemoStudioExperience() {
  // Seed before StudioRoot mounts (runs during this render, ahead of DemoShell's children).
  useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const brand = window.localStorage.getItem(BRAND_KEY)?.trim() || "Northwind Studio";
      const content = {
        wordmark: "none",
        eyebrow: `${brand.toUpperCase()} · SOCIAL`,
        tag: "NEW THIS QUARTER",
        footnote: `${brand.toUpperCase()} — BRAND ASSETS`,
        showDivider: true,
        showTopBar: true,
        logoDataUrl: null,
        slides: [
          {
            headline: `Say hello to ${brand}.`,
            accent: "Now live.",
            body: `${brand} launched its refreshed platform this quarter — faster, cleaner, and built to scale with the audience.`,
          },
          {
            headline: "One brand,",
            accent: "every channel.",
            body: "Carousels, banners, posts and avatars — all generated on-brand from a single design system.",
          },
        ],
      };
      window.localStorage.setItem(STUDIO_KEY, JSON.stringify({ content }));
    } catch {
      /* ignore */
    }
    return null;
  });

  return (
    <DemoShell
      active="Studio"
      title="Studio"
      subtitle="Create on-brand social assets — carousels, banners, posts and avatars."
    >
      <StudioRoot />
    </DemoShell>
  );
}
