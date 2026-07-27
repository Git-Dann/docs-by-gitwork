import type { MetadataRoute } from "next";

/**
 * Web app manifest. Foundry is used daily by the team, often on a phone, so it is
 * worth being installable — and it satisfies the has_manifest / pwa_manifest /
 * web_app_manifest_linked checks, which had nothing to find before this.
 *
 * `start_url` is /app rather than / because an installed icon is only ever used by
 * a signed-in team member; middleware sends them to /login if the session has gone.
 *
 * Colours come from the light-theme tokens in globals.css: --surface-canvas for the
 * background and the brand primary for theme_color. Kept in sync with the themeColor
 * viewport export in layout.tsx.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Foundry by Gitwork",
    short_name: "Foundry",
    description:
      "Gitwork's prompt-to-production delivery platform for projects, signals, documents, reviews, and support.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FAFAF9",
    theme_color: "#1D4ED8",
    icons: [
      {
        src: "/foundry-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/foundry-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
