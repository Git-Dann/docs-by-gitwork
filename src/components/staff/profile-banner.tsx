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
import { ArrowTopRightOnSquareIcon, LinkIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { BannerTile, ProfileBannerShell, type BannerMenuItem } from "@/components/profile/profile-banner-shell";
import { AccountEditors, useOwnsPassword } from "@/components/account-settings-panel";
import { PublicProfileEditor, pageUrl, toDraft } from "@/components/staff/public-profile-card";
import { usePublicProfile, useSavePublicProfile } from "@/hooks/use-staff";
import type { StaffProfile } from "@/lib/hr";

export function ProfileBanner({
  profile: p,
  displayName,
  self,
  actions,
  extraMenu = [],
}: {
  profile: StaffProfile;
  displayName: string;
  /** Your own profile: you can change your photo (and name and password, for a password sign-in). */
  self: boolean;
  /** Restore, when the viewer may. */
  actions?: ReactNode;
  /** Archive, "Same person as…" and Delete: rare, so they live in the ⋯ menu. */
  extraMenu?: BannerMenuItem[];
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

  const menu: BannerMenuItem[] = [];
  if (self) menu.push({ label: "Change photo", onClick: () => setPhoto(true) });
  if (self && ownsPassword) menu.push({ label: "Name and password", onClick: () => setAccount(true) });
  if (canHide) menu.push({ label: self ? "Hide my page…" : "Hide page…", onClick: () => setConfirmHide(true), danger: true });
  menu.push(...extraMenu);

  return (
    <>
      <ProfileBannerShell
        card={pp?.card ?? null}
        avatarUrl={p.avatarUrl}
        name={displayName}
        subtitle={
          <p className="truncate" title={subtitle}>
            {subtitle || "No job title yet"}
          </p>
        }
        onChangePhoto={self ? () => setPhoto(true) : undefined}
        actions={
          <>
            {pp ? (
              <button type="button" className="app-button app-button-secondary app-button-sm inline-flex items-center gap-1.5" onClick={() => setEditing(true)}>
                <PencilSquareIcon aria-hidden className="h-4 w-4" />
                {self ? "Edit my page" : "Edit page"}
              </button>
            ) : null}
            {actions}
          </>
        }
        menu={menu}
      >
        {pp ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BannerTile
              label="Public page"
              status={
                <>
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${pp.enabled ? "bg-[var(--success-500)]" : "bg-[var(--text-4)]"}`} />
                  {pp.enabled ? "Live" : "Off"}
                </>
              }
            >
              <div className="flex min-w-0 items-center gap-3">
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
            </BannerTile>
            <BannerTile label="Profile" status={`${pp.completeness.percent}% complete`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2,var(--border-1))]">
                <div className="h-full rounded-full bg-[var(--brand-600)] transition-[width] duration-500" style={{ width: `${pp.completeness.percent}%` }} />
              </div>
              <p className="mt-2 truncate text-[12px] text-[var(--text-3)]" title={pp.completeness.missing.join(", ")}>
                {pp.completeness.missing.length ? `Still to add: ${pp.completeness.missing.join(", ")}.` : "Everything is filled in."}
              </p>
            </BannerTile>
          </div>
        ) : null}
      </ProfileBannerShell>

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
    </>
  );
}
