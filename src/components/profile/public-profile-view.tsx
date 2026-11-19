/**
 * A person's public profile (CLAUDE.md §139). Two layouts from one set of data:
 *  - phone (< lg): link-in-bio. Their business card or a band, the bio, Book a call, one row of
 *    link tiles ending in Share (QR code, copy link, save contact), then the sections.
 *  - desktop (lg+): LinkedIn-shaped. A banner and large photo, name, headline, facts and actions
 *    in a main column with About, Experience and Skills; a sticky sidebar with the business card,
 *    the QR code and every link written out.
 * Presentational (no hooks, no fetching), so the page, the demo and the tests draw the same thing.
 * Every block rises in a beat after the one before (`motion-rise`).
 *
 * Avatars are plain <img>: the photo comes from the profile's own public route or an external
 * address, and both are dynamic.
 */
import type { CSSProperties, ReactNode } from "react";
import { BriefcaseIcon, CalendarDaysIcon, MapPinIcon, PencilSquareIcon, SparklesIcon } from "@heroicons/react/24/outline";
import type { PublicProfile } from "@/server/public-profile";
import { ProfileSharePanel, ProfileShareTile, type ProfileShareData } from "./profile-share-actions";
import { Pattern, ProfileBusinessCard } from "./profile-card";
import { PlatformMark } from "@/lib/platform-icons";
import { cardColour } from "@/lib/profile-card";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const rise = (i: number): CSSProperties => ({ animationDelay: `${i * 70}ms` });
/** Where the owner edits their page. */
export const EDIT_PROFILE_HREF = "/app/backstage?area=me";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
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

function Avatar({ p, className, text }: { p: PublicProfile; className: string; text: string }) {
  return p.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.avatarUrl} alt="" className={`${className} bg-[var(--surface-1)] object-cover`} />
  ) : (
    <span aria-hidden className={`${className} flex items-center justify-center bg-[var(--brand-50)] text-[var(--brand-700)] ${text}`} style={{ fontFamily: "var(--font-display)" }}>
      {initials(p.name)}
    </span>
  );
}

function BookCall({ url, className = "" }: { url: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] bg-[var(--brand-600)] px-4 text-[14px] font-semibold text-white transition hover:bg-[var(--brand-700)] ${className}`}
    >
      <CalendarDaysIcon aria-hidden className="h-5 w-5" />
      Book a call
    </a>
  );
}

function EditLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={EDIT_PROFILE_HREF}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 text-[13px] font-medium text-[var(--text-1)] transition hover:border-[var(--brand-500)] ${className}`}
    >
      <PencilSquareIcon aria-hidden className="h-4 w-4" />
      Edit profile
    </a>
  );
}

/** "Head of Product, Gitwork" reads as a role at an organisation; anything else stays whole. */
function splitRole(title: string): { role: string; org: string | null } {
  const i = title.lastIndexOf(", ");
  return i > 0 ? { role: title.slice(0, i), org: title.slice(i + 2) } : { role: title, org: null };
}

function About({ p, step }: { p: PublicProfile; step: number }) {
  return p.summary ? (
    <Card title="About" step={step}>
      <div className="space-y-3 text-[15px] leading-7 text-[var(--text-2)]">
        {p.summary.split(/\n{2,}/).map((para, i) => (
          <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">
            {para}
          </p>
        ))}
      </div>
    </Card>
  ) : null;
}

function Skills({ p, step }: { p: PublicProfile; step: number }) {
  return p.skills.length ? (
    <Card title="Skills" step={step}>
      <ul className="flex flex-wrap gap-2">
        {p.skills.map((s) => (
          <li key={s} className="rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-1)] px-2.5 py-1 text-[13px] text-[var(--text-2)]">
            {s}
          </li>
        ))}
      </ul>
    </Card>
  ) : null;
}

function Footer({ p, step }: { p: PublicProfile; step: number }) {
  return (
    <footer className="motion-rise flex items-center justify-center gap-2 pt-4 text-[12px] text-[var(--text-4)]" style={rise(step)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/foundry-logo.svg" alt="Foundry" width={245} height={64} className="h-4 w-auto opacity-70 dark:brightness-0 dark:invert" />
      <span>{p.company} · Profile on Foundry</span>
    </footer>
  );
}

export function PublicProfileView({ profile, isOwner = false }: { profile: PublicProfile; isOwner?: boolean }) {
  const p = profile;
  const pageUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "https://foundry.gitwork.co.uk").replace(/\/$/, "")}/u/${p.slug}`;
  const share: ProfileShareData = { name: p.name, headline: p.headline, company: p.company, links: p.links };
  const person = { name: p.name, headline: p.headline, company: p.company, location: p.location, avatarUrl: p.avatarUrl };
  return (
    <main className="min-h-screen bg-[var(--surface-canvas,var(--surface-1))]">
      <div className="px-3 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-14 lg:hidden">
        <PhoneProfile p={p} isOwner={isOwner} pageUrl={pageUrl} share={share} person={person} />
      </div>
      <div className="hidden px-6 py-10 lg:block">
        <DesktopProfile p={p} isOwner={isOwner} pageUrl={pageUrl} share={share} person={person} />
      </div>
    </main>
  );
}

type ViewProps = {
  p: PublicProfile;
  isOwner: boolean;
  pageUrl: string;
  share: ProfileShareData;
  person: { name: string; headline: string | null; company: string; location: string | null; avatarUrl: string | null };
};

// ── Phone: link-in-bio ──────────────────────────────────────────────────────────────────────

function PhoneProfile({ p, isOwner, pageUrl, share, person }: ViewProps) {
  // With a card, the card already shows the company and location.
  const meta = [
    p.card ? null : { icon: BriefcaseIcon, text: p.company },
    p.card || !p.location ? null : { icon: MapPinIcon, text: p.location },
    p.yearsExperience ? { icon: SparklesIcon, text: `${p.yearsExperience}+ years' experience` } : null,
  ].filter((m): m is { icon: typeof BriefcaseIcon; text: string } => Boolean(m));
  let step = 1;
  return (
    <div className="mx-auto w-full max-w-[680px] space-y-4">
      <section className="motion-rise relative overflow-hidden rounded-[16px] border border-[var(--border-1)] bg-[var(--surface-0)]">
        {p.card ? (
          <div className="p-3 sm:p-4">
            {/* Tilts to the pointer and turns over to a QR code of this page. */}
            <ProfileBusinessCard card={p.card} person={person} url={pageUrl} />
            <p className="mt-2 text-center text-[11px] text-[var(--text-4)]">Tap the card for a QR code</p>
          </div>
        ) : (
          <div
            aria-hidden
            className="h-16 sm:h-20"
            style={{ background: "radial-gradient(120% 160% at 0% 0%, var(--brand-500) 0%, transparent 60%), linear-gradient(135deg, var(--brand-700), #312E81)" }}
          />
        )}
        <div className="px-5 pb-5 sm:px-7">
          {p.card ? (
            // The card shows the name; the page still needs its heading.
            <h1 className="sr-only">{p.name}</h1>
          ) : (
            <>
              {/* A rounded square with a ring outside it, not a circle with a border over it: a
                  photo framed tight to the head keeps the head. */}
              <Avatar p={p} className="relative -mt-10 block h-[84px] w-[84px] rounded-[20px] ring-4 ring-[var(--surface-0)]" text="text-[28px]" />
              <h1
                className="mt-3 break-words text-[28px] font-normal leading-[1.1] tracking-[-0.02em] text-[var(--text-1)] [overflow-wrap:anywhere] sm:text-[34px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {p.name}
                {p.pronouns ? <span className="ml-2 align-middle text-[14px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>({p.pronouns})</span> : null}
              </h1>
              {p.headline ? <p className="mt-1 text-[15px] leading-6 text-[var(--text-2)] [overflow-wrap:anywhere]">{p.headline}</p> : null}
            </>
          )}
          {meta.length || (p.card && p.pronouns) ? (
            <ul className={`${p.card ? "mt-1" : "mt-2.5"} flex flex-wrap gap-x-4 gap-y-1`}>
              {meta.map((m) => (
                <li key={m.text} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-3)]">
                  <m.icon aria-hidden className="h-4 w-4 text-[var(--text-4)]" />
                  {m.text}
                </li>
              ))}
              {p.card && p.pronouns ? <li className="text-[13px] text-[var(--text-4)]">{p.pronouns}</li> : null}
            </ul>
          ) : null}
          {p.bio ? <p className="mt-3 text-[15px] leading-6 text-[var(--text-2)] [overflow-wrap:anywhere]">{p.bio}</p> : null}
          {p.bookingUrl || isOwner ? (
            <div className="mt-4 flex gap-2">
              {p.bookingUrl ? <BookCall url={p.bookingUrl} className="flex-1" /> : null}
              {isOwner ? <EditLink className={p.bookingUrl ? "min-h-[44px]" : ""} /> : null}
            </div>
          ) : null}
          {/* One row: the links, then Share (QR code, copy link, save contact), all the same tile. */}
          <div className="mt-4 flex flex-wrap items-start gap-x-1.5 gap-y-3">
            {p.links.length ? (
              <ul className="contents" aria-label="Links">
                {p.links.map((l, i) => (
                  <li key={`${l.label}-${i}`} className="motion-rise" style={rise(i + 1)}>
                    <ProfileLinkTile label={l.label} url={l.url} />
                  </li>
                ))}
              </ul>
            ) : null}
            <ProfileShareTile data={share} pageUrl={pageUrl} />
          </div>
        </div>
      </section>

      <About p={p} step={step++} />
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
      <Skills p={p} step={step++} />
      <Footer p={p} step={step + 1} />
    </div>
  );
}

// ── Desktop: LinkedIn-shaped ────────────────────────────────────────────────────────────────

function DesktopProfile({ p, isOwner, pageUrl, share, person }: ViewProps) {
  const banner = p.card ? cardColour(p.card.colour) : null;
  const facts = [p.company, p.location, p.yearsExperience ? `${p.yearsExperience}+ years' experience` : null].filter(Boolean) as string[];
  let step = 1;
  return (
    <div className="mx-auto grid w-full max-w-[1128px] grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
      <div className="min-w-0 space-y-4">
        <section className="motion-rise overflow-hidden rounded-[16px] border border-[var(--border-1)] bg-[var(--surface-0)]">
          {/* The banner wears their card's colour and pattern, so the two read as one identity. */}
          <div
            aria-hidden
            className="relative h-[176px] overflow-hidden"
            style={
              banner
                ? { background: banner.bg, color: banner.fg }
                : { background: "radial-gradient(120% 160% at 0% 0%, var(--brand-500) 0%, transparent 60%), linear-gradient(135deg, var(--brand-700), #312E81)", color: "#fff" }
            }
          >
            {p.card ? <Pattern id={p.card.pattern} /> : null}
          </div>
          <div className="px-8 pb-7">
            <div className="flex items-end justify-between gap-4">
              <Avatar p={p} className="relative -mt-[88px] block h-[152px] w-[152px] rounded-[28px] ring-[5px] ring-[var(--surface-0)]" text="text-[48px]" />
              {isOwner ? <EditLink /> : null}
            </div>
            <h1 className="mt-4 text-[40px] font-normal leading-[1.05] tracking-[-0.02em] text-[var(--text-1)] [overflow-wrap:anywhere]" style={{ fontFamily: "var(--font-display)" }}>
              {p.name}
              {p.pronouns ? <span className="ml-3 align-middle text-[15px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>({p.pronouns})</span> : null}
            </h1>
            {p.headline ? <p className="mt-2 text-[18px] leading-7 text-[var(--text-2)]">{p.headline}</p> : null}
            {facts.length ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[14px] text-[var(--text-3)]">
                {facts.map((f, i) => (
                  <span key={f} className="inline-flex items-center gap-2">
                    {i ? <span aria-hidden className="text-[var(--text-4)]">·</span> : null}
                    {f}
                  </span>
                ))}
              </p>
            ) : null}
            {p.bio ? <p className="mt-4 max-w-[62ch] text-[15px] leading-7 text-[var(--text-2)]">{p.bio}</p> : null}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {p.bookingUrl ? <BookCall url={p.bookingUrl} /> : null}
              {p.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer me"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] pl-1.5 pr-3.5 text-[14px] font-medium text-[var(--text-1)] transition hover:border-[var(--brand-500)]"
                >
                  <LinkMark url={l.url} />
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </section>

        <About p={p} step={step++} />

        {p.achievements.length ? (
          <Card title="Experience" step={step++}>
            <ol className="divide-y divide-[var(--border-1)]">
              {p.achievements.map((a, i) => {
                const { role, org } = splitRole(a.title);
                return (
                  <li key={`${a.title}-${i}`} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <span
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)] text-[16px] text-[var(--text-2)]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {initials(org ?? role)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[16px] font-semibold text-[var(--text-1)]">{role}</p>
                      {org || a.year ? (
                        <p className="text-[14px] text-[var(--text-2)]">
                          {org}
                          {org && a.year ? " · " : ""}
                          {a.year ? <span className="text-[var(--text-3)]">{a.year}</span> : null}
                        </p>
                      ) : null}
                      {a.detail ? <p className="mt-1.5 max-w-[68ch] text-[14px] leading-6 text-[var(--text-3)]">{a.detail}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        ) : null}

        <Skills p={p} step={step++} />
      </div>

      <aside className="sticky top-6 space-y-4">
        {p.card ? (
          <div className="motion-rise" style={rise(1)}>
            <ProfileBusinessCard card={p.card} person={person} url={pageUrl} />
            <p className="mt-2 text-center text-[11px] text-[var(--text-4)]">Click the card to turn it over</p>
          </div>
        ) : null}
        <Card title="Share" step={2}>
          <ProfileSharePanel data={share} pageUrl={pageUrl} />
        </Card>
        {p.links.length ? (
          <Card title="Links" step={3}>
            <ul className="-my-1.5 divide-y divide-[var(--border-1)]">
              {p.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer me" className="group flex items-center gap-3 py-2.5">
                    <LinkMark url={l.url} />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium text-[var(--text-1)] group-hover:text-[var(--brand-700)]">{l.label}</span>
                      <span className="block truncate text-[12px] text-[var(--text-4)]" title={l.url}>
                        {hostOf(l.url)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Footer p={p} step={4} />
      </aside>
    </div>
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

/** A link's official mark at button size. */
function LinkMark({ url }: { url: string }) {
  return isLinkedIn(url) ? (
    <span className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border-3)] bg-[var(--surface-1)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/linkedin.svg" alt="" width={18} height={18} className="h-[18px] w-[18px]" />
    </span>
  ) : (
    <PlatformMark url={url} size="md" />
  );
}

/** One link as a logo tile: the brand's official mark, the label as its accessible name. */
function ProfileLinkTile({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer me"
      title={label}
      className="group flex w-[56px] flex-col items-center gap-1.5 rounded-[12px] transition hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
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
