"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import { useLocalSettings } from "@/lib/local-settings";

export function SettingsPanel() {
  const { settings, updateSettings } = useLocalSettings();

  return (
    <div className="proposal-form-theme grid gap-4">
      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <h2 className="text-base font-semibold">Proposal defaults</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Shared defaults used across proposals and sign-off sections.
        </p>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
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

      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <h2 className="text-base font-semibold">Proposal branding</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Template-owned cover branding lives here. Proposal-specific client logos still belong in the builder.
        </p>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Gitwork cover logo</span>
            <ImagePicker
              value={settings.templateBranding.coverBrandLogoUrl}
              onChange={(coverBrandLogoUrl) =>
                updateSettings((current) => ({
                  ...current,
                  templateBranding: { ...current.templateBranding, coverBrandLogoUrl },
                }))
              }
              previewClassName="h-36 w-full"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Cover top accent</span>
            <ImagePicker
              value={settings.templateBranding.coverTopAccentUrl}
              onChange={(coverTopAccentUrl) =>
                updateSettings((current) => ({
                  ...current,
                  templateBranding: { ...current.templateBranding, coverTopAccentUrl },
                }))
              }
              previewClassName="h-36 w-full"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Cover bottom accent</span>
            <ImagePicker
              value={settings.templateBranding.coverBottomAccentUrl}
              onChange={(coverBottomAccentUrl) =>
                updateSettings((current) => ({
                  ...current,
                  templateBranding: { ...current.templateBranding, coverBottomAccentUrl },
                }))
              }
              previewClassName="h-36 w-full"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <h2 className="text-base font-semibold">Confidentiality defaults</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          The cover editor uses an internal/external toggle and resolves the final copy from these defaults.
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

      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Objective snippets</h2>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              Reusable objectives available inside the proposal builder.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() =>
              updateSettings((current) => ({
                ...current,
                proposalDefaults: {
                  ...current.proposalDefaults,
                  objectiveSnippets: [
                    ...current.proposalDefaults.objectiveSnippets,
                    { title: "", description: "" },
                  ],
                },
              }))
            }
          >
            Add snippet
          </Button>
        </div>

        {settings.proposalDefaults.objectiveSnippets.length ? (
          <div className="mt-4 space-y-3">
            {settings.proposalDefaults.objectiveSnippets.map((snippet, index) => (
              <article
                key={`${snippet.title}-${index}`}
                className="grid gap-3 rounded-xl border border-[var(--border-1)] p-3 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto]"
              >
                <Input
                  label="Title"
                  value={snippet.title}
                  onChange={(title) =>
                    updateSettings((current) => ({
                      ...current,
                      proposalDefaults: {
                        ...current.proposalDefaults,
                        objectiveSnippets: current.proposalDefaults.objectiveSnippets.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, title } : entry,
                        ),
                      },
                    }))
                  }
                />
                <Input
                  label="Description"
                  value={snippet.description}
                  onChange={(description) =>
                    updateSettings((current) => ({
                      ...current,
                      proposalDefaults: {
                        ...current.proposalDefaults,
                        objectiveSnippets: current.proposalDefaults.objectiveSnippets.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, description } : entry,
                        ),
                      },
                    }))
                  }
                />
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      updateSettings((current) => ({
                        ...current,
                        proposalDefaults: {
                          ...current.proposalDefaults,
                          objectiveSnippets: current.proposalDefaults.objectiveSnippets.filter(
                            (_, entryIndex) => entryIndex !== index,
                          ),
                        },
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--text-3)]">No snippets configured yet.</p>
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
        className="w-full"
      />
    </label>
  );
}
