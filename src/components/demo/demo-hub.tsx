"use client";

/**
 * Landing page for the demo suite (`/demo`) — the sales front door. Every `/demo/*`
 * page is otherwise only reachable by direct URL; this is where a prospect lands.
 * Pick a module, drop straight into a running (sample-data, no-auth) instance of it.
 *
 * Respects the same white-label link the rest of the demo uses: `?client=` rebrands
 * the copy, `?color=` recolours the accent, `?modules=` filters the cards — so a link
 * built in Settings → Demo is consistent from the very first screen.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import {
  filterModules,
  readDemoModules,
  readDemoColor,
  brandCssVars,
  BRAND_KEY,
} from "@/lib/demo/demo-config";

/** Read the white-label client name synchronously. Precedence: the path segment (`/demo/SWG`) →
 *  the `?client=` query (legacy links) → localStorage. Whichever wins is persisted so it survives
 *  navigation into the module pages (whose nav links don't carry the name). */
function readBrand(): string | null {
  if (typeof window === "undefined") return null;
  const seg = window.location.pathname.match(/^\/demo\/([^/]+)\/?$/);
  if (seg) {
    const fromPath = decodeURIComponent(seg[1]).trim();
    if (fromPath) {
      window.localStorage.setItem(BRAND_KEY, fromPath);
      return fromPath;
    }
  }
  const param = new URLSearchParams(window.location.search).get("client");
  if (param !== null) {
    const trimmed = param.trim();
    if (trimmed) window.localStorage.setItem(BRAND_KEY, trimmed);
    else window.localStorage.removeItem(BRAND_KEY);
    return trimmed || null;
  }
  return window.localStorage.getItem(BRAND_KEY);
}

export function DemoHub() {
  // Cards mirror the demo sidebar — filtered by the config (URL ?modules= / localStorage).
  const [demos] = useState(() => filterModules(readDemoModules()));
  // Read brand + colour synchronously so the first paint is already on-brand (no flash).
  const [brand] = useState<string | null>(() => readBrand());
  const [brandColor] = useState(() => readDemoColor());

  const name = brand ?? "Foundry";
  const eyebrow = brand ? "Powered by Foundry" : "Foundry by Gitwork";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--surface-canvas)] text-[var(--text-1)]" suppressHydrationWarning>
      {brandColor ? (
        <style dangerouslySetInnerHTML={{ __html: `:root{${brandCssVars(brandColor)}}` }} />
      ) : null}

      {/* ── Hero ── */}
      <header className="relative overflow-hidden border-b border-[var(--border-2)] bg-[linear-gradient(180deg,var(--surface-brand-soft)_0%,var(--surface-0)_100%)]">
        {/* soft brand wash behind the headline */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full opacity-60 blur-3xl"
          style={{ background: "var(--surface-brand-strong)" }}
        />
        <div className="relative mx-auto max-w-5xl px-6 pb-14 pt-14 sm:px-8 sm:pb-16 sm:pt-16">
          {/* Wordmark + demo badge */}
          <div className="mb-8 flex items-center gap-3">
            {brand ? (
              <span className="flex flex-col leading-none">
                <span className="font-[family-name:var(--font-display)] text-[24px] tracking-[-0.5px] text-[var(--text-1)]">
                  {brand}
                </span>
                <span className="mt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
                  Powered by Foundry
                </span>
              </span>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src="/foundry-logo.svg" alt="Foundry" width={245} height={64} className="h-9 w-auto dark:brightness-0 dark:invert" />
            )}
            <span
              className="rounded-[4px] bg-[var(--brand-600)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-white"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Demo
            </span>
          </div>

          <p
            className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-700)]"
          >
            {eyebrow} · Live product
          </p>
          <h1 className="max-w-3xl text-[40px] font-normal leading-[1.08] tracking-[-0.03em] text-[var(--text-1)] sm:text-[54px]">
            See what {name} can do —
            <br />
            <span className="text-[var(--text-3)]">by using the real thing, right now.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--text-3)]">
            Every module below is the real product — the same platform Gitwork uses to take a build
            from prompt to production. It&rsquo;s running live on sample data, so click straight in
            and have a proper look around.
          </p>

          {/* Trust strip */}
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2">
            {["Real product, not a mockup", "Live sample data", "No login · nothing is saved"].map(
              (item) => (
                <span
                  key={item}
                  className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-4)]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-500)]" />
                  {item}
                </span>
              ),
            )}
          </div>
        </div>
      </header>

      {/* ── Module cards ── */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-8 sm:py-14">
        <div className="mb-5 flex items-center gap-2">
          <span
            className="text-[11px] uppercase tracking-[1.4px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <span className="text-[var(--brand-600)]">01</span>
            {` // Pick a module`}
          </span>
          <span className="h-px flex-1 bg-[var(--border-2)]" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {demos.map(({ href, icon: Icon, label, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--surface-brand)] text-[var(--brand-700)] transition group-hover:bg-[var(--brand-600)] group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <ArrowRightIcon className="h-4 w-4 text-[var(--text-4)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-700)]" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-[var(--text-1)]">{label}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-3)]">{description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-700)] opacity-0 transition group-hover:opacity-100">
                Open the demo
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </main>

      {/* Footer — pinned to the bottom of the viewport (main flex-1); Gitwork credit + tagline */}
      <footer className="border-t border-[var(--border-2)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-4 px-6 py-6 sm:flex-row sm:items-center sm:px-8">
          <p className="text-sm text-[var(--text-4)]">
            Built with <span className="font-medium text-[var(--text-2)]">Foundry</span> — the
            agency platform by Gitwork.
          </p>
          <a
            href="https://gitwork.co.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-700)] transition hover:text-[var(--brand-800)]"
          >
            From prompt to production
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}
