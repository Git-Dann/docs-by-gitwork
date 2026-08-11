import type { Metadata, Viewport } from "next";
import { Inter, DM_Serif_Display, JetBrains_Mono, Caveat, Dancing_Script, Great_Vibes, Fraunces, Playfair_Display, Poppins, Montserrat, Space_Grotesk, Manrope, Archivo, Sora } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Script fonts for the TYPED e-signature flow (/sign/[token]). Only the signing page references
// these via CSS family names, so the bundle weight is mostly opportunistic — browsers won't
// download them until a `font-family: Caveat` rule actually matches an element.
// preload:false — these are route-specific (signing page only). Without it next/font
// injects a <link rel="preload"> for every family on EVERY route, eagerly fetching
// ~11 unused woff2 files (render-blocking weight). With it, the @font-face still ships
// so the browser fetches the file lazily the moment a `font-family` rule matches.
const caveat = Caveat({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-caveat", display: "swap", preload: false });
const dancingScript = Dancing_Script({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dancing-script", display: "swap", preload: false });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: ["400"], variable: "--font-great-vibes", display: "swap", preload: false });

// Studio marketing-brand fonts — used only by the /app/studio social-asset templates
// (Cream/Purple style preset). Bound to CSS vars; browsers only fetch them once a
// `font-family: var(--font-fraunces|--font-playfair)` rule actually matches, so they
// add no weight to the rest of the app.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "serif"],
});
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "serif"],
});

// Extra display/sans families offered as text-layer fonts in Studio's App Screenshots mode.
// Bound to CSS vars (next/font self-hosts them, so no runtime request to Google — keeps the CSP
// intact and lets html-to-image rasterize them cleanly). Only fetched once a matching
// `font-family: var(--font-…)` rule is actually used.
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap", preload: false, fallback: ["sans-serif"] });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap", preload: false, fallback: ["sans-serif"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap", preload: false, fallback: ["sans-serif"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", preload: false, fallback: ["sans-serif"] });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap", preload: false, fallback: ["sans-serif"] });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap", preload: false, fallback: ["sans-serif"] });

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
      className={`${inter.variable} ${dmSerifDisplay.variable} ${jetbrainsMono.variable} ${caveat.variable} ${dancingScript.variable} ${greatVibes.variable} ${fraunces.variable} ${playfairDisplay.variable} ${poppins.variable} ${montserrat.variable} ${spaceGrotesk.variable} ${manrope.variable} ${archivo.variable} ${sora.variable}`}
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
            __html: `(function(){try{var p=location.pathname,force=/^\\/(docs|report|sign|timeline|brand|onboarding|preview|embed|demo|apply|vet)(?:\\/|$)/.test(p),fdark=/^\\/edge(?:\\/|$)/.test(p);var m=localStorage.getItem('gitwork.theme.v1')||'system';var dark=fdark||(!force&&(m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)));document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
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
