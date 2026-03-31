"use client";

import {
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import { useLocalSettings } from "@/lib/local-settings";
import { cn } from "@/lib/format";

type TabId = "general" | "branding" | "content" | "developer";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "branding", label: "Branding" },
  { id: "content", label: "Content" },
  { id: "developer", label: "Developer" },
];

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <div className="space-y-6">
      {/* Tab nav — Untitled UI underline style */}
      <div className="border-b border-[var(--border-2)]">
        <nav className="-mb-px flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 pb-3 pt-1 text-sm font-semibold transition",
                activeTab === tab.id
                  ? "border-b-2 border-[var(--brand-600)] text-[var(--brand-700)]"
                  : "border-b-2 border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "general" && <GeneralTab />}
      {activeTab === "branding" && <BrandingTab />}
      {activeTab === "content" && <ContentTab />}
      {activeTab === "developer" && <DeveloperTab />}
    </div>
  );
}

function GeneralTab() {
  const { settings, updateSettings } = useLocalSettings();

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <p className="app-eyebrow">Workspace</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Proposal defaults
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Shared defaults pre-filled across proposals and sign-off sections.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <FieldInput
            label="Prepared by"
            value={settings.workspace.preparedBy}
            onChange={(preparedBy) =>
              updateSettings((current) => ({
                ...current,
                workspace: { ...current.workspace, preparedBy },
              }))
            }
          />
          <FieldInput
            label="Team / department"
            value={settings.workspace.team}
            onChange={(team) =>
              updateSettings((current) => ({
                ...current,
                workspace: { ...current.workspace, team },
              }))
            }
          />
          <FieldInput
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
    </div>
  );
}

function BrandingTab() {
  const { settings, updateSettings } = useLocalSettings();

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <p className="app-eyebrow">Template assets</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Proposal branding
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Template-owned cover assets. Proposal-specific client logos belong in the proposal builder.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <FieldLabel>Gitwork cover logo</FieldLabel>
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
          <div className="space-y-2">
            <FieldLabel>Cover top accent</FieldLabel>
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
          <div className="space-y-2">
            <FieldLabel>Cover bottom accent</FieldLabel>
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
    </div>
  );
}

function ContentTab() {
  const { settings, updateSettings } = useLocalSettings();

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <p className="app-eyebrow">Cover copy</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Confidentiality defaults
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          The cover editor uses an internal/external toggle and resolves the final copy from these defaults.
        </p>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <FieldTextArea
            label="Internal statement"
            value={settings.workspace.internalConfidentialityText}
            onChange={(internalConfidentialityText) =>
              updateSettings((current) => ({
                ...current,
                workspace: { ...current.workspace, internalConfidentialityText },
              }))
            }
          />
          <FieldTextArea
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
        <div className="flex flex-wrap items-start justify-between gap-4">
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
          <div className="mt-6 space-y-3">
            {settings.proposalDefaults.objectiveSnippets.map((snippet, index) => (
              <article
                key={`${snippet.title}-${index}`}
                className="grid gap-3 rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto]"
              >
                <FieldInput
                  label="Title"
                  value={snippet.title}
                  onChange={(title) =>
                    updateSettings((current) => ({
                      ...current,
                      proposalDefaults: {
                        ...current.proposalDefaults,
                        objectiveSnippets: current.proposalDefaults.objectiveSnippets.map(
                          (entry, entryIndex) =>
                            entryIndex === index ? { ...entry, title } : entry,
                        ),
                      },
                    }))
                  }
                />
                <FieldInput
                  label="Description"
                  value={snippet.description}
                  onChange={(description) =>
                    updateSettings((current) => ({
                      ...current,
                      proposalDefaults: {
                        ...current.proposalDefaults,
                        objectiveSnippets: current.proposalDefaults.objectiveSnippets.map(
                          (entry, entryIndex) =>
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

function DeveloperTab() {
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

  const maskedKey = apiKey
    ? `${"•".repeat(Math.min(apiKey.length - 6, 24))}${apiKey.slice(-6)}`
    : "";

  return (
    <div className="space-y-6">
      {/* API credentials */}
      <section className="app-card p-6">
        <p className="app-eyebrow">Credentials</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          API access
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Connect external clients — iOS app, Postman, scripts — to this workspace. Send the key as{" "}
          <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-2)]">
            Authorization: Bearer &lt;key&gt;
          </code>{" "}
          on every request.
        </p>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <FieldLabel>Base URL</FieldLabel>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm text-[var(--text-1)]">
                {baseUrl}
              </code>
              <CopyButton copied={copiedUrl} onClick={() => copy(baseUrl, setCopiedUrl)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>API key</FieldLabel>
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
                <CopyButton copied={copiedKey} onClick={() => copy(apiKey, setCopiedKey)} />
              </div>
            ) : (
              <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-3 py-2.5 text-sm text-[var(--text-4)]">
                No API key configured. Set{" "}
                <code className="font-mono">NEXT_PUBLIC_API_KEY</code> in your environment variables.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* API docs link */}
      <section className="app-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="app-eyebrow">Reference</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              API documentation
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
              Full endpoint reference with request/response shapes, auth details, and error codes.
            </p>
          </div>
          <Link
            href="/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-1)] shadow-[var(--shadow-xs)] transition hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]"
          >
            View API docs
            <ArrowTopRightOnSquareIcon className="h-4 w-4 text-[var(--text-4)]" />
          </Link>
        </div>

        {/* Quick endpoint list */}
        <div className="mt-6 rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Endpoints
          </p>
          <div className="mt-3 space-y-1.5 font-mono text-xs text-[var(--text-3)]">
            {([
              ["GET", "/api/health", "Health check (no auth)"],
              ["GET", "/api/proposals", "List proposals"],
              ["POST", "/api/proposals", "Create proposal"],
              ["GET", "/api/proposals/:id", "Get proposal"],
              ["PATCH", "/api/proposals/:id", "Update proposal"],
              ["POST", "/api/proposals/:id/duplicate", "Duplicate"],
              ["POST", "/api/proposals/:id/archive", "Archive"],
              ["DELETE", "/api/proposals/:id/delete", "Delete"],
              ["PATCH", "/api/proposals/:id/costing", "Save costing"],
              ["PATCH", "/api/proposals/:id/timeline", "Save timeline"],
              ["PATCH", "/api/proposals/:id/engagement", "Save engagement"],
              ["GET", "/api/proposals/:id/export", "Export as PDF"],
              ["GET", "/api/templates", "List templates"],
            ] as const).map(([method, path, label]) => (
              <div key={path} className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "w-12 shrink-0 font-semibold",
                    method === "GET"
                      ? "text-emerald-600"
                      : method === "DELETE"
                        ? "text-rose-600"
                        : method === "PATCH"
                          ? "text-amber-600"
                          : "text-sky-600",
                  )}
                >
                  {method}
                </span>
                <span className="text-[var(--text-2)]">{path}</span>
                <span className="text-[var(--text-4)]">— {label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function CopyButton({
  copied,
  onClick,
}: {
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:border-[var(--border-1)] hover:text-[var(--text-1)]"
    >
      <ClipboardDocumentIcon className="h-4 w-4" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-sm font-medium text-[var(--text-2)]">{children}</span>
  );
}

function FieldInput({
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
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        className="w-full"
      />
    </label>
  );
}

function FieldTextArea({
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
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full"
      />
    </label>
  );
}
