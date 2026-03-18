"use client";

import { Button } from "@/components/ui/button";
import { useLocalSettings } from "@/lib/local-settings";

export function SettingsPanel() {
  const { settings, updateSettings } = useLocalSettings();

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <h2 className="text-base font-semibold">Account profile</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Update your avatar, name, email address, and password placeholder for this POC.
        </p>

        <div className="mt-4 space-y-3">
          <Input
            label="Profile image URL"
            value={settings.account.avatarUrl}
            onChange={(avatarUrl) =>
              updateSettings((current) => ({
                ...current,
                account: { ...current.account, avatarUrl },
              }))
            }
          />
          <Input
            label="Name"
            value={settings.account.name}
            onChange={(name) =>
              updateSettings((current) => ({
                ...current,
                account: { ...current.account, name },
              }))
            }
          />
          <Input
            label="Email"
            value={settings.account.email}
            onChange={(email) =>
              updateSettings((current) => ({
                ...current,
                account: { ...current.account, email },
              }))
            }
          />
          <Input
            label="Password"
            value={settings.account.password}
            type="password"
            onChange={(password) =>
              updateSettings((current) => ({
                ...current,
                account: { ...current.account, password },
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <h2 className="text-base font-semibold">Workspace defaults</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Used for sign-off blocks and shared proposal defaults.
        </p>

        <div className="mt-4 space-y-3">
          <Input
            label="Prepared by"
            value={settings.workspace.preparedBy}
            onChange={(preparedBy) =>
              updateSettings((current) => ({
                ...current,
                workspace: { ...current.workspace, preparedBy },
              }))
            }
          />
          <Input
            label="Team / department"
            value={settings.workspace.team}
            onChange={(team) =>
              updateSettings((current) => ({
                ...current,
                workspace: { ...current.workspace, team },
              }))
            }
          />
          <Input
            label="Contact details"
            value={settings.workspace.contactDetails}
            onChange={(contactDetails) =>
              updateSettings((current) => ({
                ...current,
                workspace: { ...current.workspace, contactDetails },
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4 xl:col-span-2">
        <h2 className="text-base font-semibold">Confidentiality defaults</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          The proposal builder now uses an internal/external toggle and resolves the final copy from these defaults.
        </p>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <TextArea
            label="Internal statement"
            value={settings.workspace.internalConfidentialityText}
            onChange={(internalConfidentialityText) =>
              updateSettings((current) => ({
                ...current,
                workspace: { ...current.workspace, internalConfidentialityText },
              }))
            }
          />
          <TextArea
            label="External statement"
            value={settings.workspace.externalConfidentialityText}
            onChange={(externalConfidentialityText) =>
              updateSettings((current) => ({
                ...current,
                workspace: { ...current.workspace, externalConfidentialityText },
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4 xl:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Invited users</h2>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              Added from the profile pop-out.
            </p>
          </div>

          {settings.workspace.invitedUsers.length ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                updateSettings((current) => ({
                  ...current,
                  workspace: { ...current.workspace, invitedUsers: [] },
                }))
              }
            >
              Clear invites
            </Button>
          ) : null}
        </div>

        {settings.workspace.invitedUsers.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {settings.workspace.invitedUsers.map((email) => (
              <div
                key={email}
                className="flex items-center justify-between rounded-xl border border-[var(--border-1)] px-3 py-2"
              >
                <span className="text-sm text-[var(--text-2)]">{email}</span>
                <Button
                  type="button"
                  variant="danger"
                  size="xs"
                  onClick={() =>
                    updateSettings((current) => ({
                      ...current,
                      workspace: {
                        ...current.workspace,
                        invitedUsers: current.workspace.invitedUsers.filter((entry) => entry !== email),
                      },
                    }))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--text-3)]">No invited users yet.</p>
        )}
      </section>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        className="h-11 w-full rounded-xl border border-[var(--border-1)] px-3 text-sm"
      />
    </label>
  );
}

function TextArea({
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
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-xl border border-[var(--border-1)] px-3 py-3 text-sm"
      />
    </label>
  );
}
