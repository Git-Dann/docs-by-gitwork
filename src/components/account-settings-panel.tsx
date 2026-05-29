"use client";

import { useEffect, useState } from "react";
import { useAccount, useUpdateAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";

export function AccountSettingsPanel() {
  const accountQuery = useAccount();
  const updateAccount = useUpdateAccount();

  const profile = accountQuery.data;
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setAvatarUrl(profile.avatarUrl);
      setDirty(false);
    }
    // Intentionally subscribing on the two specific fields rather than the whole `profile`
    // object — we only want to reset local edits when the underlying name/avatar actually
    // change, not on every reference identity churn from refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.name, profile?.avatarUrl]);

  function save() {
    updateAccount.mutate({ name, avatarUrl }, { onSuccess: () => setDirty(false) });
  }

  if (accountQuery.isLoading) {
    return (
      <div className="proposal-form-theme">
        <div className="app-card p-6">
          <p className="text-sm text-[var(--text-3)]">Loading your account…</p>
        </div>
      </div>
    );
  }

  if (accountQuery.isError || !profile) {
    return (
      <div className="proposal-form-theme">
        <div className="app-card p-6">
          <p className="text-sm text-[var(--text-3)]">
            Couldn&apos;t load your account. Try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="proposal-form-theme grid gap-4 xl:grid-cols-2">
      <section className="app-card p-6">
        <p className="app-eyebrow">Profile</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Your account
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Manage the name and image shown in the sidebar and across the platform.
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
          </div>

          <Input
            label="Name"
            value={name}
            onChange={(value) => {
              setName(value);
              setDirty(true);
            }}
          />

          <ReadOnlyField label="Email" value={profile.email} hint="Set by your Google sign-in." />
          <ReadOnlyField
            label="Role"
            value={profile.role === "ADMIN" ? "Admin" : "Staff"}
            hint="Workspace admins set roles in Team settings."
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {dirty ? (
            <span className="text-xs text-[var(--text-4)]">Unsaved changes</span>
          ) : null}
          <Button
            type="button"
            variant="primary"
            onClick={save}
            disabled={!dirty || updateAccount.isPending}
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
            <p className="mt-0.5 text-xs text-[var(--text-4)]">{profile.email}</p>
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

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="text"
        className="w-full"
      />
    </label>
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
