"use client";

import { useState } from "react";
import { Menu, MenuButton, MenuItems } from "@headlessui/react";
import {
  ChevronDownIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowTopRightOnSquareIcon,
  GlobeAltIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

const chipBtn =
  "inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50";

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
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all"
        style={{ left: on ? 18 : 2 }}
      />
    </button>
  );
}

/** Smart preview + URL pill + Copy / Open actions for an active share link. */
function LinkRow({
  url,
  openHref,
  copied,
  onCopy,
}: {
  url: string;
  /** Relative page path, e.g. /wiki/wedge/<token> — used for Open + the preview. */
  openHref: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      {/* Smart preview — the actual social/unfurl card recipients will see. */}
      <div className="overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${openHref}/opengraph-image`}
          alt="Link preview"
          loading="lazy"
          className="block aspect-[1200/630] w-full object-cover"
        />
      </div>
      <p
        className="truncate rounded-[7px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)] px-2.5 py-2 text-[11px] text-[var(--text-3)]"
        style={{ fontFamily: MONO }}
      >
        {url}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[7px] bg-[var(--brand-600)] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-700)]"
        >
          {copied ? (
            <>
              <CheckIcon className="h-3.5 w-3.5 shrink-0" />
              Copied
            </>
          ) : (
            <>
              <ClipboardDocumentIcon className="h-3.5 w-3.5 shrink-0" />
              Copy link
            </>
          )}
        </button>
        <a
          href={openHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-[7px] border border-[var(--border-2)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
        >
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" />
          Open
        </a>
      </div>
    </div>
  );
}

interface Props {
  /** Client slug — makes the public URL readable (/wiki/<slug>/<token>). */
  slug: string;
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
  slug,
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
  const pageHref = pageToken ? `/wiki/${slug}/${pageToken}` : null;
  const pageUrl = pageHref ? `${origin}${pageHref}` : null;
  const wikiOn = wikiEnabled && !!wikiToken;
  const wikiHref = wikiOn ? `/wiki/${slug}/${wikiToken}` : null;
  const wikiUrl = wikiHref ? `${origin}${wikiHref}` : null;
  const pageOn = !!pageToken;
  const anyOn = pageOn || wikiOn;

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
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-600)]" /> Shared
          </>
        ) : (
          "Share"
        )}
        <ChevronDownIcon className="h-3.5 w-3.5 text-[var(--text-4)]" />
      </MenuButton>

      <MenuItems
        anchor="bottom end"
        className="z-50 mt-2 w-[min(20.5rem,92vw)] overflow-hidden rounded-[14px] border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_16px_40px_-8px_rgba(0,0,0,0.22)] focus:outline-none"
      >
        {/* Eyebrow */}
        <div className="border-b border-[rgba(0,0,0,0.06)] px-4 py-2.5">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
            style={{ fontFamily: MONO }}
          >
            Share
          </p>
        </div>

        {/* ── Entire wiki (primary) ── */}
        <div className="px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <GlobeAltIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-3)]" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--text-1)]">
                  Share entire wiki
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-4)]">
                  One link to every page — Timeline, docs, changelog & client sections.
                </p>
              </div>
            </div>
            <Toggle on={wikiOn} disabled={wikiBusy} onClick={() => onToggleWiki(!wikiOn)} />
          </div>

          {wikiUrl && wikiHref && (
            <LinkRow
              url={wikiUrl}
              openHref={wikiHref}
              copied={copied === "wiki"}
              onCopy={() => copy(wikiUrl, "wiki")}
            />
          )}
        </div>

        <div className="h-px bg-[rgba(0,0,0,0.06)]" />

        {/* ── This page (secondary) ── */}
        <div className="px-4 py-3.5">
          {wikiOn ? (
            // The full-wiki link already covers this page — no separate toggle.
            <div className="flex items-start gap-2.5">
              <DocumentTextIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--text-3)]">Share this page</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-4)]">
                  Included in the full-wiki link above. Turn that off to share{" "}
                  {pageLabel} on its own.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <DocumentTextIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-3)]" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--text-1)]">
                      Share this page
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-4)]">
                      Public link to {pageLabel} only.
                    </p>
                  </div>
                </div>
                <Toggle on={pageOn} disabled={pageBusy} onClick={() => onTogglePage(!pageOn)} />
              </div>

              {pageOn && pageUrl && pageHref && (
                <LinkRow
                  url={pageUrl}
                  openHref={pageHref}
                  copied={copied === "page"}
                  onCopy={() => copy(pageUrl, "page")}
                />
              )}
            </>
          )}
        </div>
      </MenuItems>
    </Menu>
  );
}
