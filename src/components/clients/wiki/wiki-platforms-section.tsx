"use client";

/**
 * Platforms — the client's platforms from Portal, as links, with what renews when.
 *
 * Links only: logins and internal notes are never loaded into the wiki DTO
 * (src/server/wiki-platforms.ts). Edited in Portal → client → 10 // PLATFORMS; this page
 * only reads. Clicking a card opens its details — every link written out in full with a
 * copy button, and what renews when.
 */

import { useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { MONO, SERIF } from "@/components/analytics/analytics-widgets";
import {
  renewalPhrase,
  renewalTone,
  upcomingRenewals,
  type UpcomingRenewal,
  type WikiPlatform,
  type WikiPlatformsSection,
} from "@/lib/wiki-platforms";

const TONE_CLASS: Record<ReturnType<typeof renewalTone>, string> = {
  overdue: "text-[var(--danger-500)] font-semibold",
  soon: "text-[var(--warning-500)] font-semibold",
  later: "text-[var(--text-3)]",
};

export function renewalDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** One renewal as a line — shared by this page and the dashboard card so they read the same. */
export function RenewalLine({ r }: { r: UpcomingRenewal }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="min-w-0 truncate text-[var(--text-2)]" title={`${r.what} · ${r.platformName}`}>
        {r.what}
        {r.what !== r.platformName ? (
          <span className="text-[var(--text-4)]"> · {r.platformName}</span>
        ) : null}
      </span>
      <span
        className={`shrink-0 text-[11px] ${TONE_CLASS[renewalTone(r.days)]}`}
        style={{ fontFamily: MONO }}
        title={renewalDate(r.renewsOn)}
      >
        {r.days < 0 ? `Due ${renewalPhrase(r.days)}` : renewalPhrase(r.days)}
      </span>
    </li>
  );
}

function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-1)] px-2 py-1 text-[12px] text-[var(--text-2)] transition-colors hover:border-[var(--brand-600)] hover:text-[var(--brand-700)]"
    >
      <span className="max-w-[180px] truncate" title={label}>
        {label}
      </span>
      <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0" />
    </a>
  );
}

/** Every link a platform has, labelled, in the order the card and the popup show them. */
export function platformLinks(p: WikiPlatform): { href: string; label: string }[] {
  return [
    p.url ? { href: p.url, label: "Production" } : null,
    p.stagingUrl ? { href: p.stagingUrl, label: "Staging" } : null,
    p.repoUrl ? { href: p.repoUrl, label: "Repository" } : null,
    ...p.links.map((l) => ({ href: l.url, label: l.label })),
  ].filter((x): x is { href: string; label: string } => Boolean(x));
}

function PlatformCard({ p, now, onOpen }: { p: WikiPlatform; now: Date; onOpen: () => void }) {
  const links = platformLinks(p);
  const renewal = upcomingRenewals([p], now, 1)[0] ?? null;

  return (
    // The card opens its details on click — except when the click was on one of its own
    // links, which open the link instead. A div with an explicit button inside rather than
    // a <button> wrapper, because links cannot be nested inside a button.
    <div
      className="group min-w-0 cursor-pointer rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] p-4 transition-colors hover:border-[var(--brand-500)]"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        onOpen();
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 break-words text-left text-[17px] leading-snug text-[var(--text-1)] hover:text-[var(--brand-700)]"
          style={{ fontFamily: SERIF, fontWeight: 600 }}
          aria-label={`${p.name} — details`}
        >
          {p.name}
        </button>
        {p.platformType ? (
          <span
            className="shrink-0 rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]"
            style={{ fontFamily: MONO }}
          >
            {p.platformType}
          </span>
        ) : null}
      </div>
      {links.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {links.map((l) => (
            <LinkButton key={`${l.label}-${l.href}`} href={l.href} label={l.label} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-[var(--text-4)]">No links recorded.</p>
      )}
      {p.renewsOn ? (
        <p className="mt-3 text-[11px] text-[var(--text-3)]" style={{ fontFamily: MONO }}>
          {(p.renewalNote ?? "Renews").toUpperCase()} · {renewalDate(p.renewsOn).toUpperCase()}
          {renewal ? (
            <span className={`ml-1.5 ${TONE_CLASS[renewalTone(renewal.days)]}`}>
              ({renewalPhrase(renewal.days)})
            </span>
          ) : null}
        </p>
      ) : null}
      <p
        className="mt-3 inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)] group-hover:text-[var(--brand-700)]"
        style={{ fontFamily: MONO }}
        aria-hidden
      >
        Details <ChevronRightIcon className="h-3 w-3" />
      </p>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked — the URL is on screen to select by hand.
        }
      }}
      className="shrink-0 rounded-[6px] p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : "Copy"}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-[var(--success-500)]" />
      ) : (
        <ClipboardDocumentIcon className="h-4 w-4" />
      )}
    </button>
  );
}

/** A platform's details: every link in full with copy, and its renewal. Fixed height (§46). */
function PlatformDetails({ p, now, onClose }: { p: WikiPlatform; now: Date; onClose: () => void }) {
  const links = platformLinks(p);
  const renewal = p.renewsOn ? (upcomingRenewals([p], now, 1)[0] ?? null) : null;
  return (
    <Modal open onClose={onClose} title="PLATFORM" panelClassName="app-dialog-fixed w-full max-w-lg">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <h3
            className="min-w-0 break-words text-[22px] leading-snug text-[var(--text-1)]"
            style={{ fontFamily: SERIF, fontWeight: 600 }}
          >
            {p.name}
          </h3>
          {p.platformType ? (
            <span
              className="mt-1 shrink-0 rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]"
              style={{ fontFamily: MONO }}
            >
              {p.platformType}
            </span>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            Links
          </p>
          {links.length === 0 ? (
            <p className="text-[13px] text-[var(--text-4)]">No links recorded.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-1)] rounded-[8px] border border-[var(--border-1)]">
              {links.map((l) => (
                <li key={`${l.label}-${l.href}`} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-[var(--text-1)]">{l.label}</p>
                    <p
                      className="truncate text-[12px] text-[var(--text-3)]"
                      style={{ fontFamily: MONO }}
                      title={l.href}
                    >
                      {l.href.replace(/^https?:\/\//, "")}
                    </p>
                  </div>
                  <CopyButton value={l.href} label={l.label} />
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="shrink-0 rounded-[6px] p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
                    aria-label={`Open ${l.label}`}
                    title="Open"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {p.renewsOn ? (
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              Renewal
            </p>
            <p className="text-[13px] text-[var(--text-2)]">
              {p.renewalNote ?? "Renews"} · {renewalDate(p.renewsOn)}
              {renewal ? (
                <span className={`ml-1.5 text-[12px] ${TONE_CLASS[renewalTone(renewal.days)]}`} style={{ fontFamily: MONO }}>
                  {renewal.days < 0 ? `due ${renewalPhrase(renewal.days)}` : renewalPhrase(renewal.days)}
                </span>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 justify-end border-t border-[var(--border-1)] px-5 py-3">
        <button type="button" onClick={onClose} className="app-button app-button-utility app-button-xs">
          Close
        </button>
      </div>
    </Modal>
  );
}

export function WikiPlatformsSectionView({
  platforms,
  now = new Date(),
}: {
  platforms: WikiPlatformsSection;
  now?: Date;
}) {
  const due = upcomingRenewals(platforms.platforms, now, 6);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = platforms.platforms.find((p) => p.id === openId) ?? null;
  return (
    <div className="space-y-4">
      {due.length > 0 ? (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">01</span>
              {" // COMING UP FOR RENEWAL"}
            </span>
          </div>
          <ul className="space-y-2 p-5">
            {due.map((r) => (
              <RenewalLine key={r.platformId} r={r} />
            ))}
          </ul>
        </section>
      ) : null}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">{due.length > 0 ? "02" : "01"}</span>
            {" // PLATFORMS"}
          </span>
          <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
            {platforms.platforms.length}
          </span>
        </div>
        {platforms.platforms.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--text-4)]">No platforms recorded yet.</p>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {platforms.platforms.map((p) => (
              <PlatformCard key={p.id} p={p} now={now} onOpen={() => setOpenId(p.id)} />
            ))}
          </div>
        )}
      </section>
      {open ? <PlatformDetails p={open} now={now} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
