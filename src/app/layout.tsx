import type { Metadata } from "next";
import { Inter, DM_Serif_Display, JetBrains_Mono, Caveat, Dancing_Script, Great_Vibes, Fraunces, Playfair_Display } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
const caveat = Caveat({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-caveat", display: "swap" });
const dancingScript = Dancing_Script({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dancing-script", display: "swap" });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: ["400"], variable: "--font-great-vibes", display: "swap" });

// Studio marketing-brand fonts — used only by the /app/studio social-asset templates
// (Cream/Purple style preset). Bound to CSS vars; browsers only fetch them once a
// `font-family: var(--font-fraunces|--font-playfair)` rule actually matches, so they
// add no weight to the rest of the app.
const fraunces = Fraunces({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"], variable: "--font-fraunces", display: "swap" });
const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-playfair", display: "swap" });

export const metadata: Metadata = {
  // Resolves relative OpenGraph/Twitter image URLs (incl. generated og-images)
  // to absolute ones so link previews work when shared off-site.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://foundry.gitwork.co.uk",
  ),
  title: "Foundry by Gitwork",
  description:
    "Gitwork’s prompt-to-production delivery platform for projects, signals, documents, reviews, and support.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSerifDisplay.variable} ${jetbrainsMono.variable} ${caveat.variable} ${dancingScript.variable} ${greatVibes.variable} ${fraunces.variable} ${playfairDisplay.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Anti-flash theme script — runs synchronously before first paint so the
          page never flashes the wrong theme. Resolves the stored mode (default
          "system"), but FORCES light on guest-facing client-deliverable routes +
          the print/PDF render path so shared documents and PDFs stay light
          regardless of the visitor's OS preference. Kept in sync with the
          FORCE_LIGHT regex in src/components/providers/theme-provider.tsx.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname,force=/^\\/(docs|report|sign|timeline|brand|onboarding|preview|embed|demo)\\//.test(p);var m=localStorage.getItem('gitwork.theme.v1')||'system';var dark=!force&&(m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches));document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
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
        {/* Real-user Web Vitals (LCP/CLS/INP) → Vercel Speed Insights. Tiny client
            beacon; only reports from deployed environments. Our baseline for "fast". */}
        <SpeedInsights />
      </body>
    </html>
  );
}
