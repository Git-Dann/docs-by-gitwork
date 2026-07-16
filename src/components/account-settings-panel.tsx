"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { useAccount, useUpdateAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import { AvatarEditModal, type AvatarEditResult } from "@/components/account/avatar-edit-modal";
import { avatarPosition, initialsFrom, resolveAvatar } from "@/lib/avatar";
import { roleLabel } from "@/types/auth";

export function AccountSettingsPanel() {
  const { data: session } = useSession();
  const accountQuery = useAccount();
  const updateAccount = useUpdateAccount();

  const profile = accountQuery.data;

  // Identity strings come from the live session (Google) so this page renders instantly even
  // while the /api/account hook is in-flight. Name and email are not user-editable because
  // they're owned by Google Workspace.
  const sessionName = session?.user?.name ?? "";
  const sessionEmail = session?.user?.email ?? "";
  const googleAvatarUrl = session?.user?.image ?? "";

  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // What the preview actually renders — the same resolution + cover-fit + placement the
  // sidebar uses, so this box matches the avatar everywhere else in Foundry.
  const resolved = resolveAvatar(profile?.avatarUrl, googleAvatarUrl);
  const position = avatarPosition(profile?.avatarPosition);
  const initials = initialsFrom(sessionName);

  function handleSave(result: AvatarEditResult) {
    setSaveError(null);
    updateAccount.mutate(result, {
      onSuccess: () => setEditing(false),
      onError: (err) =>
        setSaveError(err instanceof Error ? err.message : "Couldn't save — try again."),
    });
  }

  return (
    <div className="proposal-form-theme space-y-6">
      <SettingsCard number="01" title="Profile">
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Sign-in identity is managed by Google Workspace — change your name there and it
          updates here automatically. The profile image below overrides your Google photo inside
          Foundry, including the sidebar.
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
          {/* Avatar column */}
          <div className="space-y-2.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Profile image</span>
            <div className="h-40 w-full overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]">
              {resolved.isInitials ? (
                <div className="flex h-full w-full items-center justify-center bg-[var(--surface-brand)] text-3xl font-semibold text-[var(--brand-700)]">
                  {initials}
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolved.src}
                  alt="Your profile"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: position }}
                />
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSaveError(null);
                setEditing(true);
              }}
              leadingIcon={<PencilSquareIcon className="h-4 w-4" />}
              className="w-full justify-center"
            >
              Edit image
            </Button>
            {saveError ? (
              <p className="text-xs text-[var(--danger-500)]">{saveError}</p>
            ) : null}
          </div>

          {/* Read-only identity */}
          <div className="space-y-4">
            <ReadOnlyField
              label="Name"
              value={sessionName}
              hint="From Google Workspace. Change it in your Google profile to update."
            />
            <ReadOnlyField
              label="Email"
              value={sessionEmail}
              hint="Set by your Google sign-in."
            />
            {profile ? (
              <ReadOnlyField
                label="Role"
                value={roleLabel(profile.role)}
                hint="Workspace admins set roles in Settings → People & access."
              />
            ) : null}
            <p className="text-xs text-[var(--text-4)]">
              Signed in via Google for <code className="font-mono">{sessionEmail || "—"}</code>.
              To sign out everywhere, use the account menu.
            </p>
          </div>
        </div>
      </SettingsCard>

      <AvatarEditModal
        open={editing}
        onClose={() => setEditing(false)}
        name={sessionName}
        googleAvatarUrl={googleAvatarUrl}
        initialAvatarUrl={profile?.avatarUrl ?? ""}
        initialPosition={profile?.avatarPosition ?? ""}
        saving={updateAccount.isPending}
        onSave={handleSave}
      />
    </div>
  );
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <div className="w-full rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-2)]">
        {value || "—"}
      </div>
      {hint ? <p className="text-xs text-[var(--text-4)]">{hint}</p> : null}
    </div>
  );
}
