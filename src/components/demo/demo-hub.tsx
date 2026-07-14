"use client";

/**
 * Landing page for the demo suite (`/demo`). Every `/demo/*` page is otherwise only
 * reachable by direct URL — this is the front door: pick a module, land straight in
 * a running (sample-data, no-auth) instance of it. Doesn't use `DemoShell` (no
 * module is "active" yet) — a standalone page in the same design language.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { filterModules, readDemoModules } from "@/lib/demo/demo-config";

export function DemoHub() {
  // Cards mirror the demo sidebar — filtered by the config (URL ?modules= / localStorage).
  const [demos] = useState(() => filterModules(readDemoModules()));
  return (
    <div className="min-h-[100dvh] bg-[var(--surface-canvas)] text-[var(--text-1)]">
      <header className="border-b border-[var(--border-2)] bg-[linear-gradient(180deg,var(--surface-brand-soft)_0%,var(--surface-0)_100%)] px-6 pb-10 pt-12 sm:px-8">
        <div className="mx-auto max-w-5xl text-left">
          <div className="mb-6 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/foundry-logo.svg" alt="Foundry" className="h-9 w-auto dark:brightness-0 dark:invert" />
            <span
              className="rounded-[4px] bg-[var(--brand-600)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-white"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Demo
            </span>
          </div>
          <h1 className="max-w-2xl text-[40px] font-normal leading-[1.15] tracking-[-0.03em] text-[var(--text-1)] sm:text-[48px]">
            Explore Foundry running, not slides.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-3)]">
            Every module below is the real product, seeded with sample data. No login, nothing you
            do here is saved. Pick a module to jump straight in.
          </p>
          <WhiteLabelField />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {demos.map(({ href, icon: Icon, label, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5 transition hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[var(--surface-brand)] text-[var(--brand-700)]">
                  <Icon className="h-5 w-5" />
                </span>
                <ArrowRightIcon className="h-4 w-4 text-[var(--text-4)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-700)]" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-[var(--text-1)]">{label}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-3)]">{description}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

const BRAND_KEY = "gitwork.demo.brand";

/** White-label control: type a client name and every demo module rebrands to it
 *  (sidebar wordmark + Studio). Persists to localStorage; blank clears it. */
function WhiteLabelField() {
  const [client, setClient] = useState("");
  useEffect(() => {
    try {
      setClient(window.localStorage.getItem(BRAND_KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  function save(value: string) {
    setClient(value);
    try {
      const trimmed = value.trim();
      if (trimmed) window.localStorage.setItem(BRAND_KEY, trimmed);
      else window.localStorage.removeItem(BRAND_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-7 max-w-md">
      <label
        htmlFor="demo-white-label"
        className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        White-label this demo
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id="demo-white-label"
          value={client}
          onChange={(e) => save(e.target.value)}
          placeholder="Your client's name (e.g. Acme Studio)"
          className="w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-2.5 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-400)] focus:ring-2 focus:ring-[var(--brand-100)]"
        />
        {client ? (
          <button
            type="button"
            onClick={() => save("")}
            className="shrink-0 rounded-[8px] border border-[var(--border-2)] px-3 py-2.5 text-sm font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
          >
            Clear
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-[var(--text-4)]">
        Rebrands every module below — the sidebar reads &ldquo;{client || "Foundry"}&rdquo;. Leave
        blank to show Foundry.
      </p>
    </div>
  );
}
