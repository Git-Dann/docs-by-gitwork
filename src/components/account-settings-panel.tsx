"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { useAccount, useUpdateAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import { AvatarEditModal, type AvatarEditResult } from "@/components/account/avatar-edit-modal";
import { avatarPosition, initialsFrom, resolveAvatar } from "@/lib/avatar";
import { isPasswordLoginAllowed, roleLabel } from "@/types/auth";

export function AccountSettingsPanel() {
  const { data: session } = useSession();
  const accountQuery = useAccount();
  const updateAccount = useUpdateAccount();

  const profile = accountQuery.data;

  // Identity strings prefer the live session so the page renders instantly while
  // /api/account is in flight, and fall back to the fetched profile.
  //
  // ⚠️ The fallback is load-bearing, not belt-and-braces. A password sign-in carries no
  // Google profile, so for a guest the session values were empty and this page rendered
  // two em-dashes where their name and email should be.
  const sessionName = session?.user?.name || profile?.name || "";
  const sessionEmail = session?.user?.email || profile?.email || "";

  // A guest has no Google account, so their name is theirs to set — and the copy on this
  // page must not tell them to go and change it in a Google profile they do not have.
  const ownsOwnName = isPasswordLoginAllowed(profile?.role);
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
          {ownsOwnName
            ? "Your name and picture are how you appear to everyone else in Foundry. Your email is what you sign in with and cannot be changed here."
            : "Sign-in identity is managed by Google Workspace — change your name there and it updates here automatically. The profile image below overrides your Google photo inside Foundry, including the sidebar."}
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
          {/* Avatar column */}
          <div className="space-y-2.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Profile image</span>
            <div className="aspect-square w-full max-w-[200px] overflow-hidden rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)]">
              {resolved.isInitials ? (
                <div className="flex h-full w-full items-center justify-center bg-[var(--surface-brand)] text-4xl font-semibold text-[var(--brand-700)]">
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
            {ownsOwnName ? (
              <NameField initial={sessionName} />
            ) : (
              <ReadOnlyField
                label="Name"
                value={sessionName}
                hint="From Google Workspace. Change it in your Google profile to update."
              />
            )}
            <ReadOnlyField
              label="Email"
              value={sessionEmail}
              hint={ownsOwnName ? "You sign in with this." : "Set by your Google sign-in."}
            />
            {profile ? (
              <ReadOnlyField
                label="Role"
                value={roleLabel(profile.role)}
                hint="Workspace admins set roles in Settings → People & access."
              />
            ) : null}
            <p className="text-xs text-[var(--text-4)]">
              {ownsOwnName ? "Signed in as " : "Signed in via Google for "}
              <code className="font-mono">{sessionEmail || "—"}</code>. To sign out
              everywhere, use the account menu.
            </p>
          </div>
        </div>
      </SettingsCard>

      {/* Only an account that actually signs in with a password gets this. For a
          Google account the field is dead weight and inviting them to set one would
          imply it does something. */}
      {isPasswordLoginAllowed(profile?.role) ? <PasswordCard /> : null}

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


/**
 * Change your own password.
 *
 * Rendered only for a role that can sign in with one. The current password is asked
 * for and verified server-side — being signed in is not proof of knowing it, and the
 * whole point of this card is that the first password arrived over Slack or email and
 * should not stay the password.
 */
function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length >= 8 && next === confirm;

  async function submit() {
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setDone(true);
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setError(json?.error ?? "Could not change your password.");
      }
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  }

  return (
    <SettingsCard number="02" title="Password">
      <p className="text-sm leading-6 text-[var(--text-3)]">
        You sign in with your email and this password. Change it to something only you
        know — whoever set up your account had to send you the first one.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="app-input w-full"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="app-input w-full"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready && !busy) void submit();
            }}
            className="app-input w-full"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => void submit()} disabled={!ready || busy}>
          {busy ? "Changing…" : "Change password"}
        </Button>
        {/* One line, and only one — a form that reports three things at once is a form
            nobody reads. Local checks first, then whatever the server said. */}
        {tooShort ? (
          <span className="text-xs text-[var(--text-4)]">At least 8 characters.</span>
        ) : mismatch ? (
          <span className="text-xs text-[var(--danger-500)]">The two new passwords differ.</span>
        ) : error ? (
          <span className="text-xs text-[var(--danger-500)]">{error}</span>
        ) : done ? (
          <span className="text-xs text-[var(--success-500)]">
            Changed. Use the new password next time you sign in.
          </span>
        ) : null}
      </div>
    </SettingsCard>
  );
}

/** An editable display name, for an account with no Google profile behind it. */
function NameField({ initial }: { initial: string }) {
  const updateAccount = useUpdateAccount();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the fetched value until the user starts typing, so the field fills in when
  // /api/account resolves rather than staying stuck on the empty first render.
  const [touched, setTouched] = useState(false);
  const shown = touched ? value : initial;

  const dirty = shown.trim().length > 0 && shown.trim() !== initial.trim();

  function save() {
    setError(null);
    setSaved(false);
    updateAccount.mutate(
      { name: shown.trim() },
      {
        onSuccess: () => setSaved(true),
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save."),
      },
    );
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">Name</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={shown}
          onChange={(e) => {
            setTouched(true);
            setValue(e.target.value);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) save();
          }}
          className="app-input min-w-[200px] flex-1"
          placeholder="Your name"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={save}
          disabled={!dirty || updateAccount.isPending}
        >
          {updateAccount.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-[var(--danger-500)]">{error}</p>
      ) : saved ? (
        <p className="text-xs text-[var(--success-500)]">Saved.</p>
      ) : (
        <p className="text-xs text-[var(--text-4)]">How you appear to everyone in Foundry.</p>
      )}
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
