"use client";

/**
 * Platforms — the client's platforms from Portal, as links, with what renews when.
 *
 * Links only: logins and internal notes are never loaded into the wiki DTO
 * (src/server/wiki-platforms.ts). Edited in Portal → client → 10 // PLATFORMS; this page
 * only reads.
 */

import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
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

function PlatformCard({ p, now }: { p: WikiPlatform; now: Date }) {
  const links = [
    p.url ? { href: p.url, label: "Production" } : null,
    p.stagingUrl ? { href: p.stagingUrl, label: "Staging" } : null,
    p.repoUrl ? { href: p.repoUrl, label: "Repository" } : null,
    ...p.links.map((l) => ({ href: l.url, label: l.label })),
  ].filter((x): x is { href: string; label: string } => Boolean(x));
  const renewal = upcomingRenewals([p], now, 1)[0] ?? null;

  return (
    <div className="min-w-0 rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] p-4">
      <div className="flex items-start justify-between gap-2">
        <p
          className="min-w-0 break-words text-[17px] leading-snug text-[var(--text-1)]"
          style={{ fontFamily: SERIF, fontWeight: 600 }}
        >
          {p.name}
        </p>
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
    </div>
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
              <PlatformCard key={p.id} p={p} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
