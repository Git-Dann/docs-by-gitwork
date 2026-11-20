"use client";

/**
 * A person's public profile (CLAUDE.md §139), on their Staff page and in Backstage → Me. With
 * `recordId` it is someone else's, opened by an Admin: they can edit it and hide it, but only the
 * person can publish it. Rules are in src/lib/public-profile.ts.
 *
 * The card is a summary (how complete it is, the link, publish or hide). The editor is a
 * fixed-height popup with a section rail: inline it made the profile page several screens long.
 */
import { useState } from "react";
import { ArrowTopRightOnSquareIcon, LinkIcon, PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { ProfileCardDesigner } from "@/components/staff/profile-card-designer";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { HeaderAction } from "@/components/staff/profile-parts";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { usePublicProfile, useSavePublicProfile } from "@/hooks/use-staff";
import { ACHIEVEMENT_KINDS, EXTRAS_LIMITS, PROFILE_LIMITS, slugProblem, type ProfileAchievement, type ProfileFeatured, type ProfileHighlight, type ProfileLink, type ProfileTestimonial } from "@/lib/public-profile";
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
  bookingUrl: p.bookingUrl,
  extras: p.extras,
});

const SECTIONS = [
  { id: "page", label: "Page and card" },
  { id: "about", label: "About and links" },
  { id: "experience", label: "Experience" },
  { id: "numbers", label: "Headline numbers" },
  { id: "work", label: "Work and clients" },
  { id: "recommendations", label: "Recommendations" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const pageUrl = (slug: string) => (typeof window === "undefined" ? `/u/${slug}` : `${window.location.origin}/u/${slug}`);

export function PublicProfileCard({
  number,
  recordId = null,
  personName,
}: {
  number: string;
  recordId?: string | null;
  personName?: string;
  /** Kept for callers; the card is always a summary now and the editor is a popup. */
  collapsible?: boolean;
}) {
  const query = usePublicProfile(recordId);
  const save = useSavePublicProfile(recordId);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Editing someone else's page: say "their", and leave publishing to them.
  const theirs = Boolean(recordId);
  const first = (personName ?? "").trim().split(/\s+/)[0] || "they";
  const p = query.data ?? null;
  if (!p) return null;

  const slug = p.slug || p.suggestedSlug;
  const url = pageUrl(slug);

  async function setEnabled(enabled: boolean) {
    if (!p) return;
    setError(null);
    try {
      await save.mutateAsync({ ...toDraft(p), enabled });
      toast.success(enabled ? "Your profile is live" : theirs ? `${first}'s page is hidden` : "Your profile is hidden");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  }

  return (
    <WidgetCard
      number={number}
      name="Public profile"
      status={p.enabled ? "Live" : "Off"}
      statusTone={p.enabled ? "success" : "info"}
      action={
        <HeaderAction onClick={() => setEditing(true)} label={theirs ? `Edit ${first}'s public profile` : "Edit your public profile"}>
          Edit
        </HeaderAction>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-[13px] font-medium text-[var(--text-1)]">Profile {p.completeness.percent}% complete</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2,var(--border-1))]">
            <div className="h-full rounded-full bg-[var(--brand-600)] transition-[width] duration-500" style={{ width: `${p.completeness.percent}%` }} />
          </div>
          {p.completeness.missing.length ? (
            <p className="mt-2 text-[12px] text-[var(--text-3)]">Still to add: {p.completeness.missing.join(", ")}.</p>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-2)]" title={url}>
            /u/{slug}
          </span>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)]"
            onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Link copied"))}
          >
            <LinkIcon aria-hidden className="h-4 w-4" />
            Copy
          </button>
          {p.enabled ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12px] text-[var(--brand-700)] hover:underline">
              View <ArrowTopRightOnSquareIcon aria-hidden className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        {error ? <p className="text-[13px] text-[var(--danger-500)]">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-[200px] text-[12px] text-[var(--text-4)]">
            {theirs
              ? p.enabled
                ? "Anyone with the link can see this page."
                : `Off. Only ${first} can publish it.`
              : p.enabled
                ? "Anyone with the link can see your page."
                : "Only you can see this until you publish it."}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="app-button app-button-secondary app-button-sm inline-flex items-center gap-1.5" onClick={() => setEditing(true)}>
              <PencilSquareIcon aria-hidden className="h-4 w-4" />
              Edit page
            </button>
            {theirs && !p.enabled ? null : (
              <button
                type="button"
                className={`app-button app-button-sm ${p.enabled ? "app-button-secondary" : "app-button-primary"}`}
                disabled={save.isPending}
                onClick={() => void setEnabled(!p.enabled)}
              >
                {p.enabled ? (theirs ? "Hide page" : "Hide my page") : "Publish my page"}
              </button>
            )}
          </div>
        </div>
      </div>

      {editing ? <PublicProfileEditor profile={p} recordId={recordId} theirs={theirs} first={first} onClose={() => setEditing(false)} /> : null}
    </WidgetCard>
  );
}

function PublicProfileEditor({
  profile: p,
  recordId,
  theirs,
  first,
  onClose,
}: {
  profile: MyPublicProfile;
  recordId: string | null;
  theirs: boolean;
  first: string;
  onClose: () => void;
}) {
  const save = useSavePublicProfile(recordId);
  const toast = useToast();
  const [section, setSection] = useState<SectionId>("page");
  const [saved, setSaved] = useState<Draft>(() => toDraft(p));
  const [draft, setDraft] = useState<Draft>(() => toDraft(p));
  const [error, setError] = useState<string | null>(null);
  // Kept as typed, so a trailing comma or space isn't swallowed mid-edit.
  const [clientsText, setClientsText] = useState(() => p.extras.clients.join(", "));

  const url = pageUrl(draft.slug);
  const slugError = slugProblem(draft.slug);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function close() {
    if (dirty && !window.confirm("Discard the changes you haven't saved?")) return;
    onClose();
  }

  async function persist(extra: { enabled?: boolean } = {}) {
    setError(null);
    try {
      const result = await save.mutateAsync({
        ...draft,
        achievements: draft.achievements.filter((a) => a.title.trim()),
        links: draft.links.filter((l) => l.url.trim() || l.label.trim()),
        ...extra,
      });
      const next = toDraft(result);
      setDraft(next);
      setSaved(next);
      toast.success(extra.enabled === true ? "Your profile is live" : extra.enabled === false ? (theirs ? `${first}'s page is hidden` : "Your profile is hidden") : "Profile saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  }

  const rail = (active: boolean) =>
    cn(
      // On a phone the rail is a sideways strip, so each tab is its own width, not the strip's.
      "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-left text-[13px] sm:w-full sm:min-w-0 sm:shrink",
      active ? "bg-[var(--brand-50)] text-[var(--brand-600)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
    );

  return (
    <Modal open onClose={close} title={theirs ? `${first.toUpperCase()}'S PUBLIC PROFILE` : "YOUR PUBLIC PROFILE"} panelClassName="app-dialog-fixed w-full max-w-4xl">
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)] sm:grid-rows-1">
        <nav
          aria-label="Profile sections"
          className="flex min-h-0 gap-1 overflow-x-auto border-b border-[var(--border-1)] p-2 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r"
        >
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={section === s.id ? "page" : undefined} className={rail(section === s.id)} onClick={() => setSection(s.id)}>
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="min-h-0 space-y-5 overflow-y-auto p-4 sm:p-5">
          {section === "page" ? (
            <>
              <div>
                <label className={label} htmlFor="pp-slug">
                  {theirs ? "Page address" : "Your page address"}
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
                </div>
                {draft.slug && slugError ? <p className="mt-1 text-[12px] text-[var(--danger-500)]">{slugError}</p> : null}
              </div>
              <div>
                <label className={label} htmlFor="pp-headline">Headline</label>
                <input id="pp-headline" className={input} placeholder="e.g. Senior Product Engineer" value={draft.headline} maxLength={PROFILE_LIMITS.headline} onChange={(e) => set("headline", e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="pp-bio">Short bio</label>
                <textarea id="pp-bio" className={`${input} min-h-[72px] py-2`} placeholder="One or two lines about you." value={draft.bio} maxLength={PROFILE_LIMITS.bio} onChange={(e) => set("bio", e.target.value)} />
              </div>
              <div className="border-t border-[var(--border-1)] pt-4">
                <ProfileCardDesigner
                  card={draft.card}
                  url={url}
                  person={{ name: p.preview.name, company: p.preview.company, avatarUrl: p.preview.avatarUrl, headline: draft.headline || null, location: draft.location || null }}
                  onChange={(card) => set("card", card)}
                />
              </div>
            </>
          ) : null}

          {section === "about" ? (
            <>
              <div>
                <label className={label} htmlFor="pp-summary">About</label>
                <textarea id="pp-summary" className={`${input} min-h-[160px] py-2`} placeholder="Your story: what you do, what you're good at, what you care about." value={draft.summary} maxLength={PROFILE_LIMITS.summary} onChange={(e) => set("summary", e.target.value)} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="pp-location">Location</label>
                  <input id="pp-location" className={input} placeholder="e.g. Manchester, UK" value={draft.location} onChange={(e) => set("location", e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="pp-linkedin">LinkedIn</label>
                  <input id="pp-linkedin" className={input} placeholder="linkedin.com/in/…" value={draft.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="pp-booking">Booking link</label>
                  <input id="pp-booking" className={input} placeholder="Cal.com, Calendly or Google" value={draft.bookingUrl} onChange={(e) => set("bookingUrl", e.target.value)} />
                  <p className="mt-1 text-[12px] text-[var(--text-4)]">Shows a Book a call button on {theirs ? "the" : "your"} page.</p>
                </div>
                <div>
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
            </>
          ) : null}

          {section === "experience" ? (
            <ListEditor
              title="Roles, education and achievements"
              addLabel="Add achievement"
              max={PROFILE_LIMITS.achievements}
              items={draft.achievements}
              blank={{ title: "", year: null, detail: null, kind: "role" } as ProfileAchievement}
              onChange={(v) => set("achievements", v)}
              render={(a, update) => (
                <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-[130px_88px_88px_minmax(0,1fr)]">
                  <select aria-label="Kind" className="app-select col-span-2 w-full text-base sm:col-span-1 sm:text-[14px]" value={a.kind ?? "role"} onChange={(e) => update({ ...a, kind: e.target.value as ProfileAchievement["kind"] })}>
                    {ACHIEVEMENT_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <input aria-label="From" className="app-input w-full text-base sm:text-[14px]" inputMode="numeric" placeholder="From" value={a.year ?? ""} onChange={(e) => update({ ...a, year: /^\d{4}$/.test(e.target.value) ? Number(e.target.value) : null })} />
                  <input
                    aria-label="To"
                    className="app-input w-full text-base disabled:opacity-50 sm:text-[14px]"
                    inputMode="numeric"
                    placeholder={a.current ? "Present" : "To"}
                    disabled={a.current}
                    value={a.endYear ?? ""}
                    onChange={(e) => update({ ...a, endYear: /^\d{4}$/.test(e.target.value) ? Number(e.target.value) : null })}
                  />
                  <input aria-label="Title" className="app-input col-span-2 w-full text-base sm:col-span-1 sm:text-[14px]" placeholder="Role, Organisation (or what you did)" value={a.title} maxLength={PROFILE_LIMITS.achievementTitle} onChange={(e) => update({ ...a, title: e.target.value })} />
                  <textarea aria-label="Detail" className="app-input col-span-2 min-h-[56px] w-full py-2 text-base sm:col-span-4 sm:text-[14px]" placeholder="A line of detail (optional)" value={a.detail ?? ""} maxLength={PROFILE_LIMITS.achievementDetail} onChange={(e) => update({ ...a, detail: e.target.value || null })} />
                  {(a.kind ?? "role") === "role" ? (
                    <label className="col-span-2 flex items-center gap-2 text-[12px] text-[var(--text-3)] sm:col-span-4">
                      <input type="checkbox" className="h-4 w-4 accent-[var(--brand-600)]" checked={Boolean(a.current)} onChange={(e) => update({ ...a, current: e.target.checked, endYear: e.target.checked ? null : a.endYear })} />
                      {theirs ? "Works here now" : "I work here now"}
                    </label>
                  ) : null}
                </div>
              )}
            />
          ) : null}

          {section === "numbers" ? (
            <ListEditor
              title="Headline numbers"
              addLabel="Add a number"
              max={EXTRAS_LIMITS.highlights}
              items={draft.extras.highlights}
              blank={{ value: "", label: "" } as ProfileHighlight}
              onChange={(v) => set("extras", { ...draft.extras, highlights: v })}
              render={(h, update) => (
                <>
                  <input className="app-input w-full text-base sm:w-28 sm:text-[14px]" placeholder="15 yrs" value={h.value} maxLength={EXTRAS_LIMITS.highlightValue} onChange={(e) => update({ ...h, value: e.target.value })} />
                  <input className="app-input w-full min-w-0 flex-1 text-base sm:text-[14px]" placeholder="What it counts" value={h.label} maxLength={EXTRAS_LIMITS.highlightLabel} onChange={(e) => update({ ...h, label: e.target.value })} />
                </>
              )}
            />
          ) : null}

          {section === "work" ? (
            <>
              <ListEditor
                title="Featured work"
                addLabel="Add a project"
                max={EXTRAS_LIMITS.featured}
                items={draft.extras.featured}
                blank={{ title: "", detail: null, url: null } as ProfileFeatured}
                onChange={(v) => set("extras", { ...draft.extras, featured: v })}
                render={(f, update) => (
                  <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                    <input className="app-input w-full text-base sm:text-[14px]" placeholder="Project" value={f.title} maxLength={EXTRAS_LIMITS.featuredTitle} onChange={(e) => update({ ...f, title: e.target.value })} />
                    <input className="app-input w-full text-base sm:text-[14px]" placeholder="Link (optional)" value={f.url ?? ""} onChange={(e) => update({ ...f, url: e.target.value || null })} />
                    <input className="app-input w-full text-base sm:col-span-2 sm:text-[14px]" placeholder="What it was and what it did" value={f.detail ?? ""} maxLength={EXTRAS_LIMITS.featuredDetail} onChange={(e) => update({ ...f, detail: e.target.value || null })} />
                  </div>
                )}
              />
              <div>
                <label className={label} htmlFor="pp-clients">Worked with</label>
                <textarea
                  id="pp-clients"
                  className={`${input} min-h-[72px] py-2`}
                  placeholder="Clients and partners, separated by commas"
                  value={clientsText}
                  onChange={(e) => {
                    setClientsText(e.target.value);
                    set("extras", { ...draft.extras, clients: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) });
                  }}
                />
              </div>
            </>
          ) : null}

          {section === "recommendations" ? (
            <ListEditor
              title="Recommendations"
              addLabel="Add a recommendation"
              max={EXTRAS_LIMITS.testimonials}
              items={draft.extras.testimonials}
              blank={{ quote: "", name: "", role: null } as ProfileTestimonial}
              onChange={(v) => set("extras", { ...draft.extras, testimonials: v })}
              render={(t, update) => (
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  <textarea className="app-input min-h-[64px] w-full py-2 text-base sm:col-span-2 sm:text-[14px]" placeholder="What they said" value={t.quote} maxLength={EXTRAS_LIMITS.quote} onChange={(e) => update({ ...t, quote: e.target.value })} />
                  <input className="app-input w-full text-base sm:text-[14px]" placeholder="Their name" value={t.name} maxLength={EXTRAS_LIMITS.quoteName} onChange={(e) => update({ ...t, name: e.target.value })} />
                  <input className="app-input w-full text-base sm:text-[14px]" placeholder="Their role (optional)" value={t.role ?? ""} maxLength={EXTRAS_LIMITS.quoteRole} onChange={(e) => update({ ...t, role: e.target.value || null })} />
                </div>
              )}
            />
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border-1)] px-4 py-3 sm:px-5">
        <p className={cn("min-w-0 flex-1 basis-[220px] text-[12px]", error ? "text-[var(--danger-500)]" : "text-[var(--text-4)]")}>
          {error ?? (dirty ? "Unsaved changes." : "Rates, clients and HR details never appear on the page.")}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={close}>
            Close
          </button>
          {theirs && !p.enabled ? null : (
            <button
              type="button"
              className="app-button app-button-secondary app-button-sm"
              disabled={save.isPending || Boolean(slugError)}
              onClick={() => void persist({ enabled: !p.enabled })}
            >
              {p.enabled ? (theirs ? "Hide page" : "Hide my page") : "Save and publish"}
            </button>
          )}
          <button type="button" className="app-button app-button-primary app-button-sm" disabled={save.isPending || Boolean(slugError) || !dirty} onClick={() => void persist()}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
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
