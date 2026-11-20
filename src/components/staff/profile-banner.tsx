"use client";

/**
 * The top of a person's Staff profile: one full-width banner in their own card colours, holding
 * everything that used to be said three times (a header, an Account card and a Public profile
 * card). Photo, name and role; the actions for this record; and, where the viewer can see it,
 * the public page's status, link and how complete it is.
 *
 * Hiding a live page is deliberately not a button: it sits in the ⋯ menu and asks first, so a
 * page people are already sharing never goes dark from a stray click.
 */
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ArrowTopRightOnSquareIcon, CameraIcon, EllipsisHorizontalIcon, LinkIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import { Pattern } from "@/components/profile/profile-card";
import { AccountEditors, useOwnsPassword } from "@/components/account-settings-panel";
import { PublicProfileEditor, pageUrl, toDraft } from "@/components/staff/public-profile-card";
import { usePublicProfile, useSavePublicProfile } from "@/hooks/use-staff";
import { cardColour } from "@/lib/profile-card";
import type { StaffProfile } from "@/lib/hr";

/** The page's own look when a person hasn't designed a card: the same as the public page's. */
const DEFAULT_BAND = {
  background: "radial-gradient(120% 160% at 0% 0%, var(--brand-500) 0%, transparent 60%), linear-gradient(135deg, var(--brand-700), #312E81)",
  color: "#fff",
};

export function ProfileBanner({
  profile: p,
  displayName,
  self,
  actions,
}: {
  profile: StaffProfile;
  displayName: string;
  /** Your own profile: you can change your photo (and name and password, for a password sign-in). */
  self: boolean;
  /** Archive, restore, merge and delete, when the viewer may. */
  actions?: ReactNode;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const ownsPassword = useOwnsPassword();
  // Your own page, or someone else's when an Admin may edit it (canEditPublicPage).
  const publicAccess = self || (p.canEditPublicProfile && Boolean(p.memberId));
  const recordId = self ? null : p.recordId;
  const pub = usePublicProfile(recordId, { enabled: publicAccess });
  const save = useSavePublicProfile(recordId);
  const pp = publicAccess ? (pub.data ?? null) : null;
  const first = displayName.trim().split(/\s+/)[0] || "they";

  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [account, setAccount] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);

  const band = pp?.card ? cardColour(pp.card.colour) : null;
  const subtitle = [p.jobTitle, p.department, p.pronouns].filter(Boolean).join(" · ");
  const slug = pp ? pp.slug || pp.suggestedSlug : "";
  const url = pp ? pageUrl(slug) : "";
  const canHide = Boolean(pp?.enabled);

  async function setEnabled(enabled: boolean) {
    if (!pp) return;
    try {
      await save.mutateAsync({ ...toDraft(pp), enabled });
      toast.success(enabled ? "Your profile is live" : self ? "Your page is hidden" : `${first}'s page is hidden`);
      setConfirmHide(false);
    } catch (e) {
      toast.error("Couldn't change the page", e instanceof Error ? e.message : "Try again.");
    }
  }

  const menu: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (self) menu.push({ label: "Change photo", onClick: () => setPhoto(true) });
  if (self && ownsPassword) menu.push({ label: "Name and password", onClick: () => setAccount(true) });
  if (canHide) menu.push({ label: self ? "Hide my page…" : "Hide page…", onClick: () => setConfirmHide(true), danger: true });

  return (
    <section className="overflow-hidden rounded-[12px] border border-[var(--border-1)] bg-[var(--surface-0)]" data-profile-banner>
      <div
        aria-hidden
        className="relative h-[92px] overflow-hidden sm:h-[112px]"
        style={band ? { background: band.bg, color: band.fg } : DEFAULT_BAND}
      >
        {pp?.card ? <Pattern id={pp.card.pattern} /> : null}
      </div>

      <div className="px-5 pb-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-[260px] items-end gap-4">
            <div className="relative -mt-10 shrink-0 sm:-mt-12">
              <Avatar src={p.avatarUrl} name={displayName} size={88} className="ring-4 ring-[var(--surface-0)]" />
              {self ? (
                <button
                  type="button"
                  onClick={() => setPhoto(true)}
                  aria-label="Change photo"
                  title="Change photo"
                  className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)] shadow-sm hover:text-[var(--brand-700)]"
                >
                  <CameraIcon aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="min-w-0 pb-1">
              <h2
                className="truncate font-display text-[26px] leading-[1.15] tracking-[-0.01em] text-[var(--text-1)] sm:text-[30px]"
                title={displayName}
              >
                {displayName}
              </h2>
              <p className="truncate text-[14px] text-[var(--text-3)]" title={subtitle}>
                {subtitle || "No job title yet"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pb-1">
            {pp ? (
              <button type="button" className="app-button app-button-secondary app-button-sm inline-flex items-center gap-1.5" onClick={() => setEditing(true)}>
                <PencilSquareIcon aria-hidden className="h-4 w-4" />
                {self ? "Edit my page" : "Edit page"}
              </button>
            ) : null}
            {actions}
            {menu.length ? (
              <Menu>
                <MenuButton className="app-button app-button-secondary app-button-sm px-2" aria-label="More">
                  <EllipsisHorizontalIcon aria-hidden className="h-4 w-4" />
                </MenuButton>
                <MenuItems anchor="bottom end" className={`${menuPanel} w-48`}>
                  {menu.map((m) => (
                    <MenuItem key={m.label}>
                      <button type="button" onClick={m.onClick} className={`${menuItem} ${m.danger ? "text-[var(--danger-500)]" : ""}`}>
                        {m.label}
                      </button>
                    </MenuItem>
                  ))}
                </MenuItems>
              </Menu>
            ) : null}
          </div>
        </div>

        {pp ? (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-[10px] border border-[var(--border-1)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="widget-data-label">Public page</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-3)]">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${pp.enabled ? "bg-[var(--success-500)]" : "bg-[var(--text-4)]"}`} />
                  {pp.enabled ? "Live" : "Off"}
                </span>
              </div>
              <div className="mt-2.5 flex min-w-0 items-center gap-3">
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--text-1)]" title={url}>
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
                {pp.enabled ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12px] text-[var(--brand-700)] hover:underline">
                    View <ArrowTopRightOnSquareIcon aria-hidden className="h-3.5 w-3.5" />
                  </a>
                ) : self ? (
                  <button type="button" className="app-button app-button-primary app-button-sm shrink-0" disabled={save.isPending} onClick={() => void setEnabled(true)}>
                    Publish
                  </button>
                ) : null}
              </div>
              {!pp.enabled && !self ? <p className="mt-1.5 text-[12px] text-[var(--text-4)]">Only {first} can publish it.</p> : null}
            </div>

            <div className="min-w-0 rounded-[10px] border border-[var(--border-1)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="widget-data-label">Profile</span>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-3)]">{pp.completeness.percent}% complete</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2,var(--border-1))]">
                <div className="h-full rounded-full bg-[var(--brand-600)] transition-[width] duration-500" style={{ width: `${pp.completeness.percent}%` }} />
              </div>
              <p className="mt-2 truncate text-[12px] text-[var(--text-3)]" title={pp.completeness.missing.join(", ")}>
                {pp.completeness.missing.length ? `Still to add: ${pp.completeness.missing.join(", ")}.` : "Everything is filled in."}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {editing && pp ? <PublicProfileEditor profile={pp} recordId={recordId} theirs={!self} first={first} onClose={() => setEditing(false)} /> : null}

      {self ? (
        <AccountEditors
          photoOpen={photo}
          onPhotoClose={() => setPhoto(false)}
          detailsOpen={account}
          onDetailsClose={() => setAccount(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["staff", "profile", p.recordId] });
            void qc.invalidateQueries({ queryKey: ["staff", "public-profile"] });
          }}
        />
      ) : null}

      <Modal open={confirmHide} onClose={() => setConfirmHide(false)} title="HIDE PAGE" panelClassName="w-full max-w-md">
        <div className="space-y-4 p-5">
          <p className="text-[14px] leading-6 text-[var(--text-2)]">
            {self ? "Hide your public page?" : `Hide ${first}'s public page?`} Anyone who opens{" "}
            <span className="font-mono text-[13px]">/u/{slug}</span> will find nothing there until{" "}
            {self ? "you publish it" : `${first} publishes it`} again. Nothing on it is deleted.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setConfirmHide(false)} disabled={save.isPending}>
              Keep it live
            </button>
            <button type="button" className="app-button app-button-danger app-button-sm" onClick={() => void setEnabled(false)} disabled={save.isPending}>
              {save.isPending ? "Hiding…" : "Hide page"}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
