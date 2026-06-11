"use client";

import { useState } from "react";
import { Menu, MenuButton, MenuItems } from "@headlessui/react";
import { ChevronDownIcon, ClipboardDocumentIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";
const chipBtn =
  "inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50";

function Toggle({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50"
      style={{ background: on ? "var(--brand-600)" : "var(--border-2)" }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
        style={{ left: on ? 18 : 2 }}
      />
    </button>
  );
}

interface Props {
  pageLabel: string;
  pageToken: string | null;
  pageBusy?: boolean;
  onTogglePage: (enabled: boolean) => void;
  wikiEnabled: boolean;
  wikiToken: string | null;
  wikiBusy?: boolean;
  onToggleWiki: (enabled: boolean) => void;
}

export function WikiShareMenu({
  pageLabel,
  pageToken,
  pageBusy,
  onTogglePage,
  wikiEnabled,
  wikiToken,
  wikiBusy,
  onToggleWiki,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pageUrl = pageToken ? `${origin}/wiki/${pageToken}` : null;
  const wikiUrl = wikiEnabled && wikiToken ? `${origin}/wiki/${wikiToken}` : null;
  const pageOn = !!pageToken;
  const anyOn = pageOn || (wikiEnabled && !!wikiToken);

  async function copy(url: string, key: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton className={chipBtn}>
        {anyOn ? (
          <>
            <span className="text-[var(--brand-600)]">●</span> Shared
          </>
        ) : (
          "Share"
        )}
        <ChevronDownIcon className="h-3.5 w-3.5 text-[var(--text-4)]" />
      </MenuButton>

      <MenuItems anchor="bottom end" className="z-50 mt-1.5 w-[min(20rem,90vw)] rounded-[12px] border border-[rgba(0,0,0,0.10)] bg-white shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] focus:outline-none">
        {/* ── This page ── */}
        <div className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-[var(--text-1)]">Share this page</p>
              <p className="text-[11px] text-[var(--text-4)]">Public link to {pageLabel} only.</p>
            </div>
            <Toggle on={pageOn} disabled={pageBusy} onClick={() => onTogglePage(!pageOn)} />
          </div>

          {pageOn && pageUrl && (
            <div className="mt-2.5 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)] p-2.5">
              <p
                className="mb-2 truncate text-[11px] text-[var(--text-4)]"
                style={{ fontFamily: MONO }}
              >
                {pageUrl}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => copy(pageUrl, "page")}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[rgba(0,0,0,0.10)] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-0,#fafaf9)]"
                >
                  <ClipboardDocumentIcon className="h-3.5 w-3.5 shrink-0" />
                  {copied === "page" ? "Copied!" : "Copy link"}
                </button>
                <a
                  href={`/wiki/${pageToken}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[rgba(0,0,0,0.10)] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-0,#fafaf9)]"
                >
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" />
                  Open
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="mx-3 border-t border-[rgba(0,0,0,0.07)]" />

        {/* ── Entire wiki ── */}
        <div className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-[var(--text-1)]">Share entire wiki</p>
              <p className="text-[11px] text-[var(--text-4)]">
                One link to all pages — Design System, IA, Dev Guide, Changelog & Course Requests.
              </p>
            </div>
            <Toggle on={wikiEnabled} disabled={wikiBusy} onClick={() => onToggleWiki(!wikiEnabled)} />
          </div>

          {wikiUrl && (
            <div className="mt-2.5 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)] p-2.5">
              <p
                className="mb-2 truncate text-[11px] text-[var(--text-4)]"
                style={{ fontFamily: MONO }}
              >
                {wikiUrl}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => copy(wikiUrl, "wiki")}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[rgba(0,0,0,0.10)] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-0,#fafaf9)]"
                >
                  <ClipboardDocumentIcon className="h-3.5 w-3.5 shrink-0" />
                  {copied === "wiki" ? "Copied!" : "Copy link"}
                </button>
                <a
                  href={`/wiki/${wikiToken}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[rgba(0,0,0,0.10)] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-0,#fafaf9)]"
                >
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" />
                  Open
                </a>
              </div>
            </div>
          )}
        </div>
      </MenuItems>
    </Menu>
  );
}
