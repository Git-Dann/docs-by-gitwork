"use client";

/**
 * Settings → Demo. Admin/super-admin tool to build a shareable, white-labelled
 * demo link: set the client name, choose which modules appear, copy the URL.
 * The link carries `?client=…&modules=…`; opening it rebrands the whole /demo
 * suite and filters the sidebar to the chosen modules. Nothing is persisted
 * server-side — it's purely a link builder.
 */

import { useState } from "react";
import { CheckIcon, ClipboardIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { DEMO_MODULES, buildDemoLink } from "@/lib/demo/demo-config";
import { cn } from "@/lib/format";

export function DemoConfigurator() {
  const [client, setClient] = useState("");
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(DEMO_MODULES.map((m) => m.id)));
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://foundry.gitwork.co.uk";
  const enabledIds = DEMO_MODULES.filter((m) => enabled.has(m.id)).map((m) => m.id);
  const link = buildDemoLink(origin, client, enabledIds);

  function toggle(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-[var(--text-1)]">Demo builder</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-3)]">
          Build a shareable, white-labelled demo link. Set a client name, pick the modules to show,
          and copy the URL. Opening it rebrands the whole demo and shows only the chosen modules —
          no login, nothing is saved.
        </p>
      </header>

      {/* Client name */}
      <section className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5 shadow-[var(--shadow-xs)]">
        <label htmlFor="demo-client" className="block text-sm font-medium text-[var(--text-1)]">
          Client name
        </label>
        <p className="mt-1 text-xs text-[var(--text-4)]">
          Shown in the sidebar wordmark and titles (e.g. &ldquo;{client || "Foundry"} HQ&rdquo;).
          Leave blank to show Foundry.
        </p>
        <input
          id="demo-client"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Your client's name (e.g. Acme Studio)"
          className="mt-3 w-full max-w-md rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-2.5 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-400)] focus:ring-2 focus:ring-[var(--brand-100)]"
        />
      </section>

      {/* Modules */}
      <section className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5 shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-1)]">Modules</h3>
            <p className="mt-1 text-xs text-[var(--text-4)]">
              Which modules appear in the demo sidebar. {enabled.size} of {DEMO_MODULES.length} on.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEnabled(new Set(DEMO_MODULES.map((m) => m.id)))}
              className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setEnabled(new Set(["dev"]))}
              className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {DEMO_MODULES.map((m) => {
            const on = enabled.has(m.id);
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                aria-pressed={on}
                className={cn(
                  "flex items-start gap-3 rounded-[8px] border px-3.5 py-3 text-left transition",
                  on
                    ? "border-[var(--brand-300)] bg-[var(--surface-brand)]"
                    : "border-[var(--border-2)] bg-[var(--surface-0)] hover:bg-[var(--surface-1)]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
                    on ? "bg-[var(--brand-600)] text-white" : "bg-[var(--surface-1)] text-[var(--text-4)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-1)]">
                    {m.label}
                    {on ? <CheckIcon className="h-3.5 w-3.5 text-[var(--brand-700)]" /> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--text-4)]">{m.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Generated link */}
      <section className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-5">
        <h3 className="text-sm font-medium text-[var(--text-1)]">Shareable demo link</h3>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full flex-1 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-2.5 font-mono text-xs text-[var(--text-2)]"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--brand-600)] px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--brand-700)]"
            >
              {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border-2)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-0)]"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Open
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
