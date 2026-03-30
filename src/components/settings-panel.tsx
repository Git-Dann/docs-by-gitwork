"use client";

import { ClipboardDocumentIcon, EyeIcon, EyeSlashIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import { useLocalSettings } from "@/lib/local-settings";

export function SettingsPanel() {
  const { settings, updateSettings } = useLocalSettings();

  return (
    <div className="proposal-form-theme grid gap-4">
      <section className="app-card p-6">
        <p className="app-eyebrow">Defaults</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Proposal defaults
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
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

      <section className="app-card p-6">
        <p className="app-eyebrow">Branding</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Proposal branding
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
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

      <section className="app-card p-6">
        <p className="app-eyebrow">Cover copy</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Confidentiality defaults
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
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

      <section className="app-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="app-eyebrow">Reusable content</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              Objective snippets
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
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

        {settings.proposalDefaults.objectiveSnippets.length > 0 ? (
          <div className="mt-4 space-y-3">
            {settings.proposalDefaults.objectiveSnippets.map((snippet, index) => (
              <article
                key={`${snippet.title}-${index}`}
                className="grid gap-3 rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto]"
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
      <ApiSection />
    </div>
  );
}

function ApiSection() {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? "";
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://docs-by-gitwork.vercel.app";

  const [revealed, setRevealed] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  function copy(text: string, setCopied: (v: boolean) => void) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const maskedKey = apiKey ? `${"•".repeat(Math.min(apiKey.length - 6, 24))}${apiKey.slice(-6)}` : "";

  return (
    <section className="app-card p-6">
      <p className="app-eyebrow">Developer</p>
      <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
        API access
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
        Use these to connect external clients — iOS app, Postman, scripts — to this workspace. Send the key as{" "}
        <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-2)]">
          Authorization: Bearer &lt;key&gt;
        </code>
        {" "}on every request.
      </p>

      <div className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Base URL</span>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm text-[var(--text-1)]">
              {baseUrl}
            </code>
            <button
              type="button"
              onClick={() => copy(baseUrl, setCopiedUrl)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:border-[var(--border-1)] hover:text-[var(--text-1)]"
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              {copiedUrl ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">API key</span>
          {apiKey ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm text-[var(--text-1)]">
                {revealed ? apiKey : maskedKey}
              </code>
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                aria-label={revealed ? "Hide API key" : "Reveal API key"}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:border-[var(--border-1)] hover:text-[var(--text-1)]"
              >
                {revealed ? (
                  <EyeSlashIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
                {revealed ? "Hide" : "Reveal"}
              </button>
              <button
                type="button"
                onClick={() => copy(apiKey, setCopiedKey)}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:border-[var(--border-1)] hover:text-[var(--text-1)]"
              >
                <ClipboardDocumentIcon className="h-4 w-4" />
                {copiedKey ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-3 py-2.5 text-sm text-[var(--text-4)]">
              No API key configured. Set <code className="font-mono">NEXT_PUBLIC_API_KEY</code> in your environment variables.
            </p>
          )}
        </div>

        <div className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">Endpoints</p>
          <div className="mt-2 space-y-1 font-mono text-xs text-[var(--text-3)]">
            {[
              ["GET", "/api/health", "Health check (no auth)"],
              ["GET", "/api/proposals", "List proposals"],
              ["POST", "/api/proposals", "Create proposal"],
              ["GET", "/api/proposals/:id", "Get proposal"],
              ["PATCH", "/api/proposals/:id", "Update proposal"],
              ["POST", "/api/proposals/:id/duplicate", "Duplicate"],
              ["POST", "/api/proposals/:id/archive", "Archive"],
              ["DELETE", "/api/proposals/:id/delete", "Delete"],
              ["POST", "/api/proposals/:id/costing", "Save costing"],
              ["POST", "/api/proposals/:id/timeline", "Save timeline"],
              ["POST", "/api/proposals/:id/engagement", "Save engagement"],
              ["POST", "/api/proposals/:id/export", "Request export"],
              ["GET", "/api/templates", "List templates"],
            ].map(([method, path, label]) => (
              <div key={path} className="flex items-baseline gap-2">
                <span className={`w-10 shrink-0 font-semibold ${method === "GET" ? "text-emerald-600" : method === "DELETE" ? "text-rose-600" : "text-sky-600"}`}>
                  {method}
                </span>
                <span className="text-[var(--text-2)]">{path}</span>
                <span className="text-[var(--text-4)]">— {label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
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
