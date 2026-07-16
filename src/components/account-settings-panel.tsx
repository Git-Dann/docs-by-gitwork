"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useAccount, useUpdateAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import { SettingsCard } from "@/components/settings/settings-card";
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

  const [avatarUrl, setAvatarUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Pre-fill the picker with whatever's currently displayed. Priority is:
  //   1. The user's custom avatar from /api/account
  //   2. The Google profile photo from the session
  // If we showed an empty preview while the API call is in flight the page would flicker.
  useEffect(() => {
    if (profile) {
      setAvatarUrl(profile.avatarUrl || googleAvatarUrl);
      setDirty(false);
      setSaveError(null);
    }
  }, [profile?.avatarUrl, googleAvatarUrl]);

  function save() {
    setSaveError(null);
    // Only persist when the user actually picked a custom value. If they left it as the Google
    // photo, we send an empty string so /api/account stays "no custom avatar" and Google's
    // image stays the source of truth.
    const value = avatarUrl === googleAvatarUrl ? "" : avatarUrl;
    updateAccount.mutate(
      { avatarUrl: value },
      {
        onSuccess: () => setDirty(false),
        onError: (err) =>
          setSaveError(err instanceof Error ? err.message : "Couldn't save — try again."),
      },
    );
  }

  function resetToGoogle() {
    setAvatarUrl(googleAvatarUrl);
    setDirty(Boolean(profile?.avatarUrl));
    setSaveError(null);
  }

  const loading = accountQuery.isLoading && !profile;
  const hasCustomAvatar = Boolean(profile?.avatarUrl);

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
          <div className="space-y-2">
            <span className="text-sm font-medium text-[var(--text-2)]">Profile image</span>
            <ImagePicker
              value={avatarUrl}
              onChange={(value) => {
                setAvatarUrl(value);
                setDirty(true);
                setSaveError(null);
              }}
              previewClassName="h-40 w-full"
              imageClassName="object-contain"
            />
            {hasCustomAvatar || avatarUrl !== googleAvatarUrl ? (
              <button
                type="button"
                onClick={resetToGoogle}
                className="text-xs font-medium text-[var(--brand-700)] hover:underline"
              >
                Use my Google photo
              </button>
            ) : googleAvatarUrl ? (
              <p className="text-xs text-[var(--text-4)]">
                Currently showing your Google photo. Choose a custom one to override.
              </p>
            ) : (
              <p className="text-xs text-[var(--text-4)]">
                Google hasn&apos;t supplied a profile photo. Upload one here.
              </p>
            )}
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

        <div className="mt-6 flex items-center justify-end gap-3">
          {saveError ? (
            <span className="text-xs text-[var(--danger-500)]">{saveError}</span>
          ) : dirty ? (
            <span className="text-xs text-[var(--text-4)]">Unsaved changes</span>
          ) : null}
          <Button
            type="button"
            variant="primary"
            onClick={save}
            disabled={!dirty || updateAccount.isPending || loading}
          >
            {updateAccount.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </SettingsCard>
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
