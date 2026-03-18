"use client";

import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import { useLocalSettings } from "@/lib/local-settings";

export function AccountSettingsPanel() {
  const { settings, updateSettings } = useLocalSettings();

  return (
    <div className="proposal-form-theme grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <h2 className="text-base font-semibold">Account settings</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Manage the account details shown in the sidebar and account menu.
        </p>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Profile image</span>
            <ImagePicker
              value={settings.account.avatarUrl}
              onChange={(avatarUrl) =>
                updateSettings((current) => ({
                  ...current,
                  account: { ...current.account, avatarUrl },
                }))
              }
              previewClassName="h-40 w-full"
            />
          </div>

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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Invited users</h2>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              Added from the account menu.
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
          <div className="mt-4 grid gap-2">
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
        className="w-full"
      />
    </label>
  );
}
