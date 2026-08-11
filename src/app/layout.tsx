import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  // Resolves relative OpenGraph/Twitter image URLs (incl. generated og-images)
  // to absolute ones so link previews work when shared off-site.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://foundry.gitwork.co.uk",
  ),
  title: "Foundry by Gitwork",
  description:
    "Gitwork’s prompt-to-production delivery platform for projects, signals, documents, reviews, and support.",
  // Self-referencing canonical. With metadataBase set, "./" resolves per route, so
  // every page declares itself canonical rather than pointing everything at the root.
  alternates: { canonical: "./" },
  openGraph: {
    siteName: "Foundry by Gitwork",
    type: "website",
    locale: "en_GB",
    url: "./",
  },
};

/**
 * Viewport + theme-color. There was no viewport export at all, so no theme-color
 * meta tag was ever emitted and mobile browser chrome fell back to a default grey.
 *
 * The two values are the light and dark `--surface-canvas` tokens from globals.css,
 * so the browser chrome matches the page rather than the brand blue — which is what
 * you want when the surface is what meets the chrome. `background_color` in
 * manifest.ts matches the light value; keep the three in sync.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF9" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        {/*
          Baseline accessibility preferences, inlined so they apply on first paint
          before globals.css arrives — which matters most for reduced-motion, where a
          late-loading rule means the animation has already played.

          These are honoured app-wide and are real behaviour, not decoration: a
          visible focus ring for keyboard users (WCAG 2.4.7), near-instant
          animations for anyone who has asked their OS to reduce motion (WCAG
          2.3.3), and stronger borders/text under prefers-contrast: more. Component
          styles can still override per-element.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html: `:focus-visible{outline:2px solid #1D4ED8;outline-offset:2px;border-radius:3px}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}}@media (prefers-contrast:more){:root{--border-1:rgba(0,0,0,.55);--border-2:rgba(0,0,0,.4);--text-3:#1E293B;--text-4:#334155}[data-theme="dark"]{--border-1:rgba(255,255,255,.7);--border-2:rgba(255,255,255,.5);--text-3:#E3E3E5;--text-4:#C9C9CE}}`,
          }}
        />
        {/*
          Anti-flash theme script — runs synchronously before first paint so the
          page never flashes the wrong theme. Resolves the stored mode (default
          "system"), but FORCES light on guest-facing client-deliverable routes +
          the print/PDF render path so shared documents and PDFs stay light
          regardless of the visitor's OS preference. It also FORCES dark on the
          Corsair Edge exec board (/edge). Kept in sync with the FORCE_LIGHT /
          FORCE_DARK regexes in src/components/providers/theme-provider.tsx.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname,force=/^\\/(docs|report|sign|timeline|brand|onboarding|preview|embed|demo|apply|vet|login|portal\\/login)(?:\\/|$)/.test(p),fdark=/^\\/edge(?:\\/|$)/.test(p);var m=localStorage.getItem('gitwork.theme.v1')||'system';var dark=fdark||(!force&&(m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)));document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
        {/*
          Demo fetch guard — the standalone /demo/* walkthroughs run with no auth or
          database; every /api/* call is answered client-side by an interceptor in
          the demo page. This synchronous shim runs BEFORE hydration (and before
          NextAuth's SessionProvider first probes /api/auth/session), short-circuiting
          the session endpoint so the demo never logs an auth "server configuration"
          error during the startup race. Full /api interception takes over once the
          page bundle loads. No-op on every non-/demo route.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(!/^\\/demo\\//.test(location.pathname))return;var of=window.fetch;window.fetch=function(i){try{var u=typeof i==='string'?i:(i&&i.url)||String(i);var p=u.indexOf('http')===0?new URL(u).pathname:u.split('?')[0];if(p.indexOf('/api/auth')===0)return Promise.resolve(new Response('{}',{status:200,headers:{'Content-Type':'application/json'}}));}catch(e){}return of.apply(this,arguments);};}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
