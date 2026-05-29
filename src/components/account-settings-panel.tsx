"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useAccount, useUpdateAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";

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

  const [avatarUrl, setAvatarUrl] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile) {
      setAvatarUrl(profile.avatarUrl);
      setDirty(false);
    }
  }, [profile?.avatarUrl]);

  function save() {
    updateAccount.mutate({ avatarUrl }, { onSuccess: () => setDirty(false) });
  }

  // Soft-loading state — we still render the panel so identity from the session is visible.
  const loading = accountQuery.isLoading && !profile;

  return (
    <div className="proposal-form-theme grid gap-4 xl:grid-cols-2">
      <section className="app-card p-6">
        <p className="app-eyebrow">Profile</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Your account
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Your sign-in identity is managed by Google Workspace — change your name there and it
          updates here automatically. The custom profile image below overrides your Google photo
          inside Foundry.
        </p>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Profile image</span>
            <ImagePicker
              value={avatarUrl}
              onChange={(value) => {
                setAvatarUrl(value);
                setDirty(true);
              }}
              previewClassName="h-40 w-full"
            />
            <p className="text-xs text-[var(--text-4)]">
              Optional. Leave blank to use your Google profile photo.
            </p>
          </div>

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
              value={profile.role === "ADMIN" ? "Admin" : "Staff"}
              hint="Workspace admins set roles in Settings → Team."
            />
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {dirty ? (
            <span className="text-xs text-[var(--text-4)]">Unsaved avatar change</span>
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
      </section>

      <section className="app-card p-6">
        <p className="app-eyebrow">Security</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Sign-in &amp; sessions
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          You sign in with Google for @gitwork.co.uk. Passwords aren&apos;t used.
        </p>

        <div className="mt-4 space-y-3 text-sm text-[var(--text-3)]">
          <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-3">
            <p className="font-medium text-[var(--text-2)]">Connected with Google</p>
            <p className="mt-0.5 text-xs text-[var(--text-4)]">{sessionEmail || "—"}</p>
          </div>
          <p className="text-xs text-[var(--text-4)]">
            Need to sign out everywhere? Use the account menu &rarr; <em>Sign out</em> after a
            password change in Google Workspace.
          </p>
        </div>
      </section>
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
