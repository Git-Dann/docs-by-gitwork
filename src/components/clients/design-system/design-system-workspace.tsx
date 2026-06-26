"use client";

import Link from "next/link";
import { useState } from "react";
import { useClientDetail } from "@/hooks/use-proposals";
import {
  useClientDesignSystem,
  useSetClientDesignSystemShare,
} from "@/hooks/use-design-system";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowTopRightOnSquareIcon,
  GlobeAltIcon,
  CubeTransparentIcon,
} from "@heroicons/react/24/outline";
import { DesignSystemViewer } from "./design-system-viewer";
import { ImportModal } from "./import-modal";
import { LogoManagerModal } from "./logo-manager-modal";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";
const chipBtn =
  "inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50";
const menuPanel =
  "z-50 mt-1.5 rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] focus:outline-none";
const menuItem =
  "flex w-full items-center rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-[var(--text-2)] transition data-[focus]:bg-[var(--surface-1)]";

/** Pill toggle — matches WikiShareMenu. */
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

/** URL pill + Copy / Open actions for an active share link. */
function LinkRow({
  url,
  openHref,
  copied,
  onCopy,
}: {
  url: string;
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

/** Whole-wiki share controls, passed in when the DS workspace is embedded in the wiki. */
export interface WikiShareControls {
  enabled: boolean;
  token: string | null;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}

export function DesignSystemWorkspace({
  slug,
  embedded = false,
  wikiShare,
}: {
  slug: string;
  /** When true, hides the "← Client" back link (used when embedded in the wiki). */
  embedded?: boolean;
  /** When provided, the Share menu also offers a whole-wiki share toggle. */
  wikiShare?: WikiShareControls;
}) {
  const { data: clientData } = useClientDetail(slug);
  const client = clientData?.client;
  const { data: ds, isPending } = useClientDesignSystem(slug);
  const share = useSetClientDesignSystemShare(slug);

  const [importOpen, setImportOpen] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [copiedCss, setCopiedCss] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWiki, setCopiedWiki] = useState(false);

  const wikiHref =
    wikiShare?.enabled && wikiShare.token ? `/wiki/${slug}/${wikiShare.token}` : null;
  const wikiUrl =
    wikiHref && typeof window !== "undefined" ? `${window.location.origin}${wikiHref}` : null;

  const tokens = ds?.tokens ?? null;
  const shareOn = ds?.share.enabled ?? false;
  const shareUrl =
    ds?.share.url && typeof window !== "undefined"
      ? `${window.location.origin}${ds.share.url}`
      : ds?.share.url ?? null;

  const copy = async (value: string, set: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(value);
      set(true);
      window.setTimeout(() => set(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="px-4 pt-6 md:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {/* Back link — hidden when embedded inside the wiki */}
        {!embedded && (
          <Link
            href={`/app/portal/${slug}`}
            className="text-[13px] text-[var(--text-3)] transition hover:text-[var(--brand-700)]"
          >
            ← {client?.name ?? "Client"}
          </Link>
        )}

        {ds?.exists && (
          <div className={`flex items-center gap-2${embedded ? " ml-auto" : ""}`}>
            {/* Share — toggle + link + open, folded into one menu */}
            <Menu as="div" className="relative">
              <MenuButton className={chipBtn}>
                {shareOn || wikiUrl ? (
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

                {/* ── Entire wiki (primary) — only when embedded in the wiki ── */}
                {wikiShare && (
                  <>
                    <div className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <GlobeAltIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-3)]" />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[var(--text-1)]">
                              Share entire wiki
                            </p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-4)]">
                              One link to every page — Timeline, docs, changelog &amp; client sections.
                            </p>
                          </div>
                        </div>
                        <Toggle
                          on={wikiShare.enabled}
                          disabled={wikiShare.busy}
                          onClick={() => wikiShare.onToggle(!wikiShare.enabled)}
                        />
                      </div>
                      {wikiUrl && wikiHref && (
                        <LinkRow
                          url={wikiUrl}
                          openHref={wikiHref}
                          copied={copiedWiki}
                          onCopy={() => copy(wikiUrl, setCopiedWiki)}
                        />
                      )}
                    </div>
                    <div className="h-px bg-[rgba(0,0,0,0.06)]" />
                  </>
                )}

                {/* ── This page (design system) ── */}
                <div className="px-4 py-3.5">
                  {wikiShare?.enabled && wikiShare.token ? (
                    // Covered by the full-wiki link — no separate toggle.
                    <div className="flex items-start gap-2.5">
                      <CubeTransparentIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-3)]">Share this page</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-4)]">
                          Included in the full-wiki link above. Turn that off to share the design
                          system on its own.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <CubeTransparentIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-3)]" />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[var(--text-1)]">
                              Share this page
                            </p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-4)]">
                              Public link to the design system only.
                            </p>
                          </div>
                        </div>
                        <Toggle
                          on={shareOn}
                          disabled={share.isPending}
                          onClick={() => share.mutate(!shareOn)}
                        />
                      </div>
                      {shareOn && shareUrl && (
                        <LinkRow
                          url={shareUrl}
                          openHref={ds.share.url ?? "#"}
                          copied={copiedLink}
                          onCopy={() => copy(shareUrl, setCopiedLink)}
                        />
                      )}
                    </>
                  )}
                </div>
              </MenuItems>
            </Menu>

            {/* Maintenance — Copy CSS / Update / Logos */}
            <Menu as="div" className="relative">
              <MenuButton className={`${chipBtn} px-2`} aria-label="Manage design system">
                <EllipsisHorizontalIcon className="h-4 w-4" />
              </MenuButton>
              <MenuItems anchor="bottom end" className={`${menuPanel} w-48`}>
                <MenuItem>
                  <button
                    type="button"
                    onClick={() => tokens && copy(tokens.cssVariables || "", setCopiedCss)}
                    className={menuItem}
                  >
                    {copiedCss ? "Copied ✓" : "Copy CSS variables"}
                  </button>
                </MenuItem>
                <MenuItem>
                  <button type="button" onClick={() => setImportOpen(true)} className={menuItem}>
                    Update tokens…
                  </button>
                </MenuItem>
                <MenuItem>
                  <button type="button" onClick={() => setLogoOpen(true)} className={menuItem}>
                    Manage logos…
                  </button>
                </MenuItem>
              </MenuItems>
            </Menu>
          </div>
        )}
      </div>

      {isPending ? (
        <p className="py-20 text-center text-sm text-[var(--text-4)]">Loading…</p>
      ) : !ds?.exists || !tokens ? (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">01</span>
              {" // DESIGN SYSTEM"}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
            <p className="max-w-md text-[14px] leading-relaxed text-[var(--text-3)]">
              No design system yet. Generate this client&apos;s tokens with the Cowork{" "}
              <span className="font-medium text-[var(--text-2)]">design-system</span> skill, then
              import the JSON here.
            </p>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-[6px] bg-[var(--brand-600)] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[var(--brand-700)]"
            >
              Import JSON
            </button>
          </div>
        </section>
      ) : (
        <DesignSystemViewer tokens={tokens} clientLogoUrl={client?.logoUrl ?? null} />
      )}

      {importOpen && <ImportModal slug={slug} onClose={() => setImportOpen(false)} />}
      {logoOpen && ds?.tokens && (
        <LogoManagerModal
          slug={slug}
          tokens={ds.tokens}
          status={ds.status}
          onClose={() => setLogoOpen(false)}
        />
      )}
    </div>
  );
}
