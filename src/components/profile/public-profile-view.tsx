/**
 * A person's public profile (CLAUDE.md §139): LinkedIn-style substance, link-in-bio shape, quietly
 * branded. Presentational only (no hooks, no fetching), so the page, the demo and the tests draw
 * exactly the same thing. Every block rises in a beat after the one before (`motion-rise`).
 *
 * Avatars here are plain <img>: the photo comes from the profile's own public route or an
 * external address, and both are dynamic.
 */
import type { CSSProperties, ReactNode } from "react";
import { BriefcaseIcon, MapPinIcon, SparklesIcon } from "@heroicons/react/24/outline";
import type { PublicProfile } from "@/server/public-profile";
import { ProfileShareActions } from "./profile-share-actions";
import { PlatformMark } from "@/lib/platform-icons";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const rise = (i: number): CSSProperties => ({ animationDelay: `${i * 70}ms` });

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function Card({ title, step, children }: { title: string; step: number; children: ReactNode }) {
  return (
    <section className="widget-card motion-rise" style={rise(step)}>
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          {title}
        </span>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

export function PublicProfileView({ profile }: { profile: PublicProfile }) {
  const p = profile;
  const meta = [
    { icon: BriefcaseIcon, text: p.company },
    p.location ? { icon: MapPinIcon, text: p.location } : null,
    p.yearsExperience ? { icon: SparklesIcon, text: `${p.yearsExperience}+ years' experience` } : null,
  ].filter((m): m is { icon: typeof BriefcaseIcon; text: string } => Boolean(m));
  let step = 1;

  return (
    <main className="min-h-screen bg-[var(--surface-canvas,var(--surface-1))] px-3 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-14">
      <div className="mx-auto w-full max-w-[680px] space-y-4">
        {/* Header card: brand band, photo, name, headline, the facts, the bio, the links. */}
        <section className="motion-rise overflow-hidden rounded-[16px] border border-[var(--border-1)] bg-[var(--surface-0)]">
          <div
            aria-hidden
            className="h-28 sm:h-32"
            style={{
              background:
                "radial-gradient(120% 140% at 0% 0%, var(--brand-500) 0%, transparent 55%), linear-gradient(135deg, var(--brand-700), #312E81)",
            }}
          />
          <div className="px-5 pb-6 sm:px-8">
            <div className="-mt-12 flex items-end justify-between gap-4">
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.avatarUrl}
                  alt=""
                  width={104}
                  height={104}
                  className="h-[104px] w-[104px] rounded-full border-4 border-[var(--surface-0)] bg-[var(--surface-1)] object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-[104px] w-[104px] items-center justify-center rounded-full border-4 border-[var(--surface-0)] bg-[var(--brand-50)] text-[32px] text-[var(--brand-700)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {initials(p.name)}
                </span>
              )}
            </div>
            <h1
              className="mt-4 break-words text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-[var(--text-1)] [overflow-wrap:anywhere] sm:text-[38px]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {p.name}
              {p.pronouns ? <span className="ml-2 align-middle font-sans text-[14px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>({p.pronouns})</span> : null}
            </h1>
            {p.headline ? <p className="mt-1.5 text-[16px] leading-6 text-[var(--text-2)] [overflow-wrap:anywhere]">{p.headline}</p> : null}
            {meta.length ? (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {meta.map((m) => (
                  <li key={m.text} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-3)]">
                    <m.icon aria-hidden className="h-4 w-4 text-[var(--text-4)]" />
                    {m.text}
                  </li>
                ))}
              </ul>
            ) : null}
            {p.bio ? <p className="mt-4 text-[15px] leading-7 text-[var(--text-2)] [overflow-wrap:anywhere]">{p.bio}</p> : null}
            {p.links.length ? (
              <ul className="mt-5 flex flex-wrap gap-x-2 gap-y-3" aria-label="Links">
                {p.links.map((l, i) => (
                  <li key={`${l.label}-${i}`} className="motion-rise" style={rise(i + 1)}>
                    <ProfileLinkTile label={l.label} url={l.url} />
                  </li>
                ))}
              </ul>
            ) : null}
            <ProfileShareActions data={{ name: p.name, headline: p.headline, company: p.company, links: p.links }} />
          </div>
        </section>

        {p.summary ? (
          <Card title="About" step={step++}>
            <div className="space-y-3 text-[15px] leading-7 text-[var(--text-2)]">
              {p.summary.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">
                  {para}
                </p>
              ))}
            </div>
          </Card>
        ) : null}

        {p.achievements.length ? (
          <Card title="Achievements" step={step++}>
            <ol className="relative space-y-5 border-l border-[var(--border-1)] pl-5">
              {p.achievements.map((a, i) => (
                <li key={`${a.title}-${i}`} className="relative">
                  <span aria-hidden className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-0)] bg-[var(--brand-600)]" />
                  {a.year ? (
                    <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                      {a.year}
                    </p>
                  ) : null}
                  <p className="text-[15px] font-medium text-[var(--text-1)] [overflow-wrap:anywhere]">{a.title}</p>
                  {a.detail ? <p className="mt-0.5 text-[14px] leading-6 text-[var(--text-3)]">{a.detail}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {p.skills.length ? (
          <Card title="Skills" step={step++}>
            <ul className="flex flex-wrap gap-2">
              {p.skills.map((s) => (
                <li key={s} className="rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-1)] px-2.5 py-1 text-[13px] text-[var(--text-2)]">
                  {s}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <footer className="motion-rise flex items-center justify-center gap-2 pt-4 text-[12px] text-[var(--text-4)]" style={rise(step + 1)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/foundry-logo.svg" alt="Foundry" width={245} height={64} className="h-4 w-auto opacity-70 dark:brightness-0 dark:invert" />
          <span>
            {p.company} · Profile on Foundry
          </span>
        </footer>
      </div>
    </main>
  );
}

/** LinkedIn's own mark. Simple Icons doesn't carry it (LinkedIn had it removed), so the official
 *  file is served from public/brand rather than redrawn (no hand-drawn logos, Dan's rule). */
function isLinkedIn(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "linkedin.com" || h.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

/** One link as a logo tile: the brand's official mark, the label as its accessible name. */
function ProfileLinkTile({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer me"
      title={label}
      className="group flex w-[64px] flex-col items-center gap-1.5 rounded-[12px] transition hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
    >
      {isLinkedIn(url) ? (
        <span className="flex h-14 w-14 items-center justify-center rounded-[12px] border border-[var(--border-3)] bg-[var(--surface-1)] transition group-hover:border-[var(--brand-500)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/linkedin.svg" alt="" width={28} height={28} className="h-7 w-7" />
        </span>
      ) : (
        <PlatformMark url={url} size="lg" className="transition group-hover:border-[var(--brand-500)]" />
      )}
      {/* The caption is the link's name, so two globe tiles (a site, a custom link) read apart. */}
      <span className="w-full truncate text-center text-[11px] text-[var(--text-3)]">{label}</span>
    </a>
  );
}
