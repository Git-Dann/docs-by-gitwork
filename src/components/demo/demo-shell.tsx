"use client";

/**
 * Shared frame for the standalone Foundry demo pages (`/demo/*`).
 *
 * Owns the pieces every demo page needs: the client-side `/api/*` fetch
 * interceptor (installed once at module load, before any query fires), a mock
 * SessionProvider, and the app-shell chrome (sidebar + header + banner + the
 * "On Your Desk" drawer). Pages just supply their content. See
 * `src/lib/demo/dev-demo-data.ts` for the canned data. No auth, no database.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";
import {
  HomeIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  UsersIcon,
  LifebuoyIcon,
  BuildingOffice2Icon,
  SwatchIcon,
  Cog8ToothIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { DeskDrawer } from "@/components/desk/desk-drawer";
import { DemoErrorBoundary } from "@/components/demo/demo-error-boundary";
import "@/lib/demo/demo-fetch";
import { demoSession } from "@/lib/demo/dev-demo-data";
import { useDemoLinkReroute } from "@/lib/demo/use-demo-nav";

type NavEntry = { label: string; icon: typeof HomeIcon; href?: string };

const NAV: NavEntry[] = [
  { label: "Foundry HQ", icon: HomeIcon, href: "/demo/dev" },
  { label: "Code", icon: CodeBracketIcon, href: "/demo/devsignal" },
  { label: "Docs", icon: DocumentTextIcon, href: "/demo/docs" },
  { label: "Portal", icon: UsersIcon, href: "/demo/portal" },
  { label: "Care", icon: LifebuoyIcon, href: "/demo/care" },
  { label: "Studio", icon: SwatchIcon, href: "/demo/studio" },
  { label: "Backstage", icon: BuildingOffice2Icon, href: "/demo/backstage" },
];

export function DemoShell({
  active,
  title,
  subtitle,
  deskOpen = false,
  children,
}: {
  active: string;
  title: string;
  subtitle: string;
  /** Pre-open the On Your Desk drawer as the desktop panel (showcase the drawer). */
  deskOpen?: boolean;
  children: ReactNode;
}) {
  // Seed the desk open-state BEFORE the drawer's own mount effect reads it, so each
  // page controls whether the drawer starts expanded (dev) or as the slim dock (wiki).
  useState(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gitwork.desk.v1", JSON.stringify({ open: deskOpen, tab: "TODAY" }));
      } catch {
        /* ignore */
      }
    }
    return null;
  });

  // Mount content only after hydration: guarantees the interceptor is live before any
  // query runs, and avoids SSR/CSR drift from the relative demo dates.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // White-label brand for a prospect demo: pass `?client=Acme Corp` once and it persists across
  // the whole demo (nav links don't carry the query), showing the client's name in the sidebar
  // with "powered by Foundry" beneath instead of the Foundry logo. Unset → the Foundry logo.
  const [brand, setBrand] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "gitwork.demo.brand";
    const param = new URLSearchParams(window.location.search).get("client");
    if (param !== null) {
      const trimmed = param.trim();
      if (trimmed) window.localStorage.setItem(KEY, trimmed);
      else window.localStorage.removeItem(KEY); // `?client=` clears it
      setBrand(trimmed || null);
    } else {
      setBrand(window.localStorage.getItem(KEY));
    }
  }, []);

  // Reroute the reused components' hardcoded /app/* links to their /demo equivalents.
  const handleDemoNav = useDemoLinkReroute();

  return (
    <SessionProvider session={demoSession as never}>
      <div
        className="relative flex h-[100dvh] flex-col bg-[var(--surface-canvas)] text-[var(--text-1)]"
        onClickCapture={handleDemoNav}
      >
        <div className="min-h-0 flex-1 w-full lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* ── Sidebar (mirrors the real app shell) ── */}
          <aside className="hidden border-r border-[var(--border-2)] bg-[linear-gradient(180deg,var(--surface-brand-soft)_0%,var(--surface-0)_38%)] lg:flex lg:min-h-0">
            <div className="flex h-full min-h-0 w-full flex-col">
              <div className="flex shrink-0 items-center justify-center border-b border-[var(--border-2)] px-6 pb-5 pt-7">
                <Link href="/demo" aria-label="All demos" className="block text-center">
                  {brand ? (
                    <span className="block">
                      <span className="block font-[family-name:var(--font-display)] text-[26px] leading-[1.1] tracking-[-0.5px] text-[var(--text-1)]">
                        {brand}
                      </span>
                      <span className="mt-1.5 block font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
                        Powered by Foundry
                      </span>
                    </span>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src="/foundry-logo.svg"
                      alt="Foundry"
                      className="h-12 w-auto dark:brightness-0 dark:invert"
                    />
                  )}
                </Link>
              </div>
              <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
                <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                  {NAV.map(({ label, icon: Icon, href }) => {
                    const isActive = label === active;
                    const classes = cn(
                      "flex w-full items-center gap-3 rounded-[6px] border px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)] shadow-[var(--shadow-xs)]"
                        : "border-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                    );
                    const inner = (
                      <>
                        <Icon className="h-5 w-5 shrink-0" />
                        {label}
                      </>
                    );
                    return href ? (
                      <Link key={label} href={href} className={classes}>
                        {inner}
                      </Link>
                    ) : (
                      <span key={label} className={cn(classes, "cursor-default")}>
                        {inner}
                      </span>
                    );
                  })}
                </nav>
                <div className="mt-4 space-y-2">
                  <span className="flex w-full items-center gap-3 rounded-[6px] border border-transparent px-3 py-2 text-sm font-medium text-[var(--text-2)]">
                    <Cog8ToothIcon className="h-5 w-5 shrink-0" />
                    Settings
                  </span>
                  <div className="flex items-center gap-2.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-600)] text-xs font-semibold text-white">
                      AR
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">Alex Rivera</p>
                      <p className="truncate text-[11px] text-[var(--text-4)]">Developer</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Content column ── */}
          <div className="flex min-h-0 flex-col bg-[var(--surface-canvas)]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--brand-200)] bg-[var(--surface-brand)] px-6 py-2 sm:px-8">
              <p className="text-xs font-medium text-[var(--brand-800)]">
                <span
                  className="mr-2 rounded-[4px] bg-[var(--brand-600)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-white"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Demo
                </span>
                Foundry — the developer experience, running on sample data.
              </p>
            </div>

            <header className="hidden border-b border-[var(--border-2)] bg-[linear-gradient(180deg,var(--surface-0)_0%,var(--surface-brand-soft)_100%)] px-6 pb-5 pt-7 sm:px-8 lg:block">
              <div className="max-w-4xl">
                <h1 className="text-[44px] font-normal leading-[1.15] tracking-[-0.03em] text-[var(--text-1)]">
                  {title}
                </h1>
                <p className="mt-1.5 text-sm leading-6 text-[var(--text-3)]">{subtitle}</p>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-auto px-6 pb-24 pt-6 sm:px-8">
              {mounted ? (
                <DemoErrorBoundary>{children}</DemoErrorBoundary>
              ) : (
                <div className="space-y-4">
                  <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
                  <div className="h-72 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
                </div>
              )}
            </main>
          </div>
        </div>

        {mounted ? (
          <DemoErrorBoundary fallback={null}>
            <DeskDrawer />
          </DemoErrorBoundary>
        ) : null}
      </div>
    </SessionProvider>
  );
}

/** Mono "NN // LABEL" section rule, matching the HQ dashboard idiom. */
export function DemoSectionHeading({ number, label }: { number: string; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className="text-[11px] uppercase tracking-[1.4px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <span className="text-[var(--brand-600)]">{number}</span>
        {` // ${label}`}
      </span>
      <span className="h-px flex-1 bg-[var(--border-2)]" />
    </div>
  );
}
