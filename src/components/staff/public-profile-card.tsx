"use client";

/**
 * Backstage → Me: your public profile (CLAUDE.md §139). Choose a handle, fill in the profile,
 * switch the page on, copy the link. A completeness meter names what's still missing, because
 * that's the point: a profile people want to fill in. Rules are in src/lib/public-profile.ts.
 */
import { useEffect, useState } from "react";
import { ArrowTopRightOnSquareIcon, LinkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { ProfileCardDesigner } from "@/components/staff/profile-card-designer";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { useToast } from "@/components/ui/toast";
import { useMyPublicProfile, useSaveMyPublicProfile } from "@/hooks/use-staff";
import { PROFILE_LIMITS, slugProblem, type ProfileAchievement, type ProfileLink } from "@/lib/public-profile";
import type { MyPublicProfile } from "@/server/public-profile";

const label = "block text-[12px] font-medium text-[var(--text-2)]";
/** 16px on a phone, so iOS doesn't zoom the page when a field takes focus. */
const input = "app-input mt-1 w-full text-base sm:text-[14px]";

type Draft = Omit<MyPublicProfile, "enabled" | "suggestedSlug" | "completeness" | "preview">;

const toDraft = (p: MyPublicProfile): Draft => ({
  slug: p.slug || p.suggestedSlug,
  headline: p.headline,
  bio: p.bio,
  summary: p.summary,
  location: p.location,
  linkedinUrl: p.linkedinUrl,
  portfolioUrl: p.portfolioUrl,
  achievements: p.achievements,
  links: p.links,
  card: p.card,
});

export function PublicProfileCard({ number }: { number: string }) {
  const query = useMyPublicProfile();
  const save = useSaveMyPublicProfile();
  const toast = useToast();
  const p = query.data ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (p && draft === null) setDraft(toDraft(p));
  }, [p, draft]);

  if (!p || !draft) return null;
  const url = typeof window === "undefined" ? `/u/${draft.slug}` : `${window.location.origin}/u/${draft.slug}`;
  const slugError = slugProblem(draft.slug);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function persist(extra: { enabled?: boolean } = {}) {
    if (!draft) return;
    setError(null);
    try {
      const saved = await save.mutateAsync({
        ...draft,
        achievements: draft.achievements.filter((a) => a.title.trim()),
        links: draft.links.filter((l) => l.url.trim() || l.label.trim()),
        ...extra,
      });
      setDraft(toDraft(saved));
      toast.success(extra.enabled === true ? "Your profile is live" : extra.enabled === false ? "Your profile is hidden" : "Profile saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  }

  const status = p.enabled ? "Live" : "Off";
  return (
    <WidgetCard number={number} name="PUBLIC PROFILE" status={status} statusTone={p.enabled ? "success" : "info"}>
      <div className="space-y-5 p-5">
        {/* How complete it is, and what would finish it. */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium text-[var(--text-1)]">Profile {p.completeness.percent}% complete</p>
            {p.enabled ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--brand-700)] hover:underline">
                View page <ArrowTopRightOnSquareIcon aria-hidden className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2,var(--border-1))]">
            <div className="h-full rounded-full bg-[var(--brand-600)] transition-[width] duration-500" style={{ width: `${p.completeness.percent}%` }} />
          </div>
          {p.completeness.missing.length ? (
            <p className="mt-2 text-[12px] text-[var(--text-3)]">Still to add: {p.completeness.missing.join(", ")}.</p>
          ) : null}
        </div>

        <div>
          <label className={label} htmlFor="pp-slug">
            Your page address
          </label>
          <div className="mt-1 flex items-stretch overflow-hidden rounded-[6px] border border-[var(--border-2)] focus-within:border-[var(--brand-500)]">
            <span className="flex items-center bg-[var(--surface-1)] px-2.5 text-[13px] text-[var(--text-4)]">/u/</span>
            <input
              id="pp-slug"
              className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-base outline-none sm:text-[14px]"
              style={{ outline: "none" }}
              value={draft.slug}
              maxLength={PROFILE_LIMITS.slugMax}
              onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            />
            <button
              type="button"
              className="flex items-center gap-1 border-l border-[var(--border-2)] px-2.5 text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)]"
              onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Link copied"))}
            >
              <LinkIcon aria-hidden className="h-4 w-4" />
              Copy
            </button>
          </div>
          {draft.slug && slugError ? <p className="mt-1 text-[12px] text-[var(--danger-500)]">{slugError}</p> : null}
        </div>

        <div className="border-t border-[var(--border-1)] pt-4">
          <ProfileCardDesigner
            card={draft.card}
            url={url}
            person={{ name: p.preview.name, company: p.preview.company, avatarUrl: p.preview.avatarUrl, headline: draft.headline || null, location: draft.location || null }}
            onChange={(card) => set("card", card)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="pp-headline">Headline</label>
            <input id="pp-headline" className={input} placeholder="e.g. Senior Product Engineer" value={draft.headline} maxLength={PROFILE_LIMITS.headline} onChange={(e) => set("headline", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="pp-bio">Short bio</label>
            <textarea id="pp-bio" className={`${input} min-h-[72px] py-2`} placeholder="One or two lines about you." value={draft.bio} maxLength={PROFILE_LIMITS.bio} onChange={(e) => set("bio", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="pp-summary">About</label>
            <textarea id="pp-summary" className={`${input} min-h-[120px] py-2`} placeholder="Your story: what you do, what you're good at, what you care about." value={draft.summary} maxLength={PROFILE_LIMITS.summary} onChange={(e) => set("summary", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="pp-location">Location</label>
            <input id="pp-location" className={input} placeholder="e.g. Manchester, UK" value={draft.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="pp-linkedin">LinkedIn</label>
            <input id="pp-linkedin" className={input} placeholder="linkedin.com/in/…" value={draft.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="pp-portfolio">Portfolio or website</label>
            <input id="pp-portfolio" className={input} placeholder="https://…" value={draft.portfolioUrl} onChange={(e) => set("portfolioUrl", e.target.value)} />
          </div>
        </div>

        <ListEditor
          title="More links"
          addLabel="Add link"
          max={PROFILE_LIMITS.links}
          items={draft.links}
          blank={{ label: "", url: "" } as ProfileLink}
          onChange={(v) => set("links", v)}
          render={(l, update) => (
            <>
              <input className="app-input w-full text-base sm:w-40 sm:text-[14px]" placeholder="Label" value={l.label} maxLength={PROFILE_LIMITS.linkLabel} onChange={(e) => update({ ...l, label: e.target.value })} />
              <input className="app-input w-full min-w-0 flex-1 text-base sm:text-[14px]" placeholder="https://…" value={l.url} onChange={(e) => update({ ...l, url: e.target.value })} />
            </>
          )}
        />

        <ListEditor
          title="Achievements"
          addLabel="Add achievement"
          max={PROFILE_LIMITS.achievements}
          items={draft.achievements}
          blank={{ title: "", year: null, detail: null } as ProfileAchievement}
          onChange={(v) => set("achievements", v)}
          render={(a, update) => (
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[96px_1fr]">
              <input className="app-input w-full text-base sm:text-[14px]" inputMode="numeric" placeholder="Year" value={a.year ?? ""} onChange={(e) => update({ ...a, year: /^\d{4}$/.test(e.target.value) ? Number(e.target.value) : null })} />
              <input className="app-input w-full text-base sm:text-[14px]" placeholder="What you did" value={a.title} maxLength={PROFILE_LIMITS.achievementTitle} onChange={(e) => update({ ...a, title: e.target.value })} />
              <input className="app-input w-full text-base sm:col-span-2 sm:text-[14px]" placeholder="A line of detail (optional)" value={a.detail ?? ""} maxLength={PROFILE_LIMITS.achievementDetail} onChange={(e) => update({ ...a, detail: e.target.value || null })} />
            </div>
          )}
        />

        {error ? <p className="text-[13px] text-[var(--danger-500)]">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-1)] pt-4">
          <p className="text-[12px] text-[var(--text-4)]">
            {p.enabled ? "Anyone with the link can see your page." : "Only you can see this until you publish it."} Rates, clients and HR details never appear on it.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="app-button app-button-secondary app-button-sm" disabled={save.isPending || Boolean(slugError)} onClick={() => void persist()}>
              Save
            </button>
            <button
              type="button"
              className={`app-button app-button-sm ${p.enabled ? "app-button-secondary" : "app-button-primary"}`}
              disabled={save.isPending || Boolean(slugError)}
              onClick={() => void persist({ enabled: !p.enabled })}
            >
              {p.enabled ? "Hide my page" : "Publish my page"}
            </button>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}

function ListEditor<T>({
  title,
  addLabel,
  max,
  items,
  blank,
  onChange,
  render,
}: {
  title: string;
  addLabel: string;
  max: number;
  items: T[];
  blank: T;
  onChange: (items: T[]) => void;
  render: (item: T, update: (next: T) => void) => React.ReactNode;
}) {
  return (
    <div>
      <p className={label}>{title}</p>
      <ul className="mt-1 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex flex-wrap items-start gap-2 rounded-[8px] border border-[var(--border-1)] p-2 sm:flex-nowrap">
            {render(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))))}
            <button type="button" aria-label="Remove" className="shrink-0 p-2 text-[var(--text-4)] hover:text-[var(--danger-500)]" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <TrashIcon aria-hidden className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      {items.length < max ? (
        <button type="button" className="mt-2 inline-flex items-center gap-1 text-[13px] text-[var(--brand-700)] hover:underline" onClick={() => onChange([...items, blank])}>
          <PlusIcon aria-hidden className="h-4 w-4" />
          {addLabel}
        </button>
      ) : null}
    </div>
  );
}
