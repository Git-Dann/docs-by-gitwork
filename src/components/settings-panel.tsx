"use client";

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRateCardPerson, deleteRateCardPerson, listRateCardPeople, updateRateCardPerson } from "@/lib/api";
import { cn } from "@/lib/format";
import { useLocalSettings } from "@/lib/local-settings";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import type { RateBillingPeriod, RateCardPersonRecord } from "@/types/rate-card";

type TabId = "general" | "branding" | "content" | "people" | "developer";

interface RateCardDraft {
  name: string;
  area: string;
  sourceRate: string;
  sourceCurrencyCode: string;
  billingPeriod: RateBillingPeriod;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "branding", label: "Branding" },
  { id: "content", label: "Content" },
  { id: "people", label: "People & Rates" },
  { id: "developer", label: "Developer" },
];

const COMMON_CURRENCIES = ["USD", "GBP", "EUR", "AED", "SAR", "CAD", "AUD"] as const;
const RATE_BILLING_PERIOD_OPTIONS: RateBillingPeriod[] = ["DAY", "WEEK", "MONTH"];

export function SettingsPanel({
  apiKeyConfigured,
}: {
  apiKeyConfigured: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--border-2)]">
        <nav className="-mb-px flex flex-wrap gap-0">
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
      {activeTab === "people" && <RateCardTab />}
      {activeTab === "developer" && <DeveloperTab apiKeyConfigured={apiKeyConfigured} />}
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

function RateCardTab() {
  const [people, setPeople] = useState<RateCardPersonRecord[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RateCardDraft>(makeEmptyRateCardDraft());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const selectedPersonIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedPersonIdRef.current = selectedPersonId;
  }, [selectedPersonId]);

  const loadPeople = useCallback(async (options?: {
    preferredId?: string | null;
    announce?: string | null;
    refreshing?: boolean;
  }) => {
    if (options?.refreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await listRateCardPeople();
      setPeople(response.people);

      const preferredId = options?.preferredId ?? selectedPersonIdRef.current;
      const preferredPerson = preferredId
        ? response.people.find((person) => person.id === preferredId) ?? null
        : null;

      if (preferredPerson) {
        selectPerson(preferredPerson);
      } else if (response.people.length > 0) {
        selectPerson(response.people[0]);
      } else {
        startNew();
      }

      if (options?.announce) {
        setStatusIsError(false);
        setStatusMessage(options.announce);
      }
    } catch (error) {
      setStatusIsError(true);
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to load People & Rates right now.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  const filteredPeople = people.filter((person) => {
    const search = searchQuery.trim().toLowerCase();
    if (!search) return true;
    return (
      person.name.toLowerCase().includes(search) ||
      person.area.toLowerCase().includes(search) ||
      person.sourceCurrencyCode.toLowerCase().includes(search)
    );
  });

  const isEditingExisting = selectedPersonId !== null;

  function selectPerson(person: RateCardPersonRecord) {
    setSelectedPersonId(person.id);
    setDraft(draftFromPerson(person));
  }

  function startNew() {
    setSelectedPersonId(null);
    setDraft(makeEmptyRateCardDraft());
  }

  async function saveDraft() {
    const normalizedName = draft.name.trim();
    const normalizedArea = draft.area.trim();
    const normalizedCurrency = draft.sourceCurrencyCode.trim().toUpperCase();
    const sourceRate = Number(draft.sourceRate);

    if (!normalizedName || !normalizedArea || !normalizedCurrency || Number.isNaN(sourceRate) || sourceRate <= 0) {
      setStatusIsError(true);
      setStatusMessage("Add a name, area, 3-letter currency, and a positive source rate before saving.");
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      if (selectedPersonId) {
        await updateRateCardPerson(selectedPersonId, {
          name: normalizedName,
          area: normalizedArea,
          sourceRate,
          sourceCurrencyCode: normalizedCurrency,
          billingPeriod: draft.billingPeriod,
        });

        await loadPeople({
          preferredId: selectedPersonId,
          announce: "Person updated.",
        });
      } else {
        const response = await createRateCardPerson({
          name: normalizedName,
          area: normalizedArea,
          sourceRate,
          sourceCurrencyCode: normalizedCurrency,
          billingPeriod: draft.billingPeriod,
        });

        await loadPeople({
          preferredId: response.person.id,
          announce: "Person added.",
        });
      }
    } catch (error) {
      setStatusIsError(true);
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to save this person right now.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelectedPerson() {
    if (!selectedPersonId) {
      return;
    }

    setArchiving(true);
    setStatusMessage(null);

    try {
      await deleteRateCardPerson(selectedPersonId);
      await loadPeople({
        preferredId: null,
        announce: "Person archived.",
      });
    } catch (error) {
      setStatusIsError(true);
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to archive this person right now.",
      );
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-eyebrow">Shared roster</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              People & Rates
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-3)]">
              This is the shared roster Axis mirrors for proposal pricing. Store source currency and
              billing period here, then let Axis convert everything to a GBP day rate on-device.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
              onClick={() =>
                void loadPeople({
                  preferredId: selectedPersonId,
                  refreshing: true,
                  announce: "Roster refreshed.",
                })
              }
              loading={refreshing}
            >
              Refresh
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              leadingIcon={<PlusIcon className="h-4 w-4" />}
              onClick={startNew}
            >
              New person
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,380px)]">
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <FieldLabel>Search roster</FieldLabel>
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, area, or currency"
                  className="w-full pl-10"
                />
              </div>
            </label>

            {loading ? (
              <div className="rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-8 text-sm text-[var(--text-3)]">
                Loading People & Rates…
              </div>
            ) : filteredPeople.length > 0 ? (
              <div className="space-y-3">
                {filteredPeople.map((person) => {
                  const selected = person.id === selectedPersonId;
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => selectPerson(person)}
                      className={cn(
                        "w-full rounded-[18px] border p-4 text-left transition",
                        selected
                          ? "border-[var(--brand-300)] bg-[var(--surface-brand)]"
                          : "border-[var(--border-2)] bg-[var(--surface-0)] hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-1)]">
                            {person.name}
                          </p>
                          <p className="mt-1 text-sm text-[var(--text-3)]">{person.area}</p>
                        </div>
                        <span className="rounded-full border border-[var(--border-2)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                          {billingPeriodLabel(person.billingPeriod)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-medium text-[var(--text-2)]">
                        {formatSourceRate(person.sourceRate, person.sourceCurrencyCode, person.billingPeriod)}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-8 text-sm text-[var(--text-3)]">
                {people.length == 0
                  ? "No people saved yet. Add your first team member to start building the shared roster."
                  : "No roster entries match that search."}
              </div>
            )}
          </div>

          <div className="rounded-[20px] border border-[var(--border-2)] bg-[var(--surface-1)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="app-eyebrow">{isEditingExisting ? "Edit person" : "New person"}</p>
                <h3 className="mt-2 text-base font-semibold text-[var(--text-1)]">
                  {isEditingExisting ? "Update roster entry" : "Add roster entry"}
                </h3>
              </div>

              {isEditingExisting ? (
                <button
                  type="button"
                  onClick={startNew}
                  className="text-sm font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
                >
                  New
                </button>
              ) : null}
            </div>

            <div className="mt-5 space-y-4">
              <FieldInput
                label="Name"
                value={draft.name}
                onChange={(name) => setDraft((current) => ({ ...current, name }))}
              />
              <FieldInput
                label="Area"
                value={draft.area}
                onChange={(area) => setDraft((current) => ({ ...current, area }))}
              />
              <FieldInput
                label="Source rate"
                value={draft.sourceRate}
                type="number"
                onChange={(sourceRate) => setDraft((current) => ({ ...current, sourceRate }))}
              />

              <label className="block space-y-1.5">
                <FieldLabel>Source currency</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(120px,140px)]">
                  <select
                    value={COMMON_CURRENCIES.includes(draft.sourceCurrencyCode as (typeof COMMON_CURRENCIES)[number]) ? draft.sourceCurrencyCode : "CUSTOM"}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue !== "CUSTOM") {
                        setDraft((current) => ({
                          ...current,
                          sourceCurrencyCode: nextValue,
                        }));
                      }
                    }}
                  >
                    {COMMON_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                    <option value="CUSTOM">Custom</option>
                  </select>
                  <input
                    value={draft.sourceCurrencyCode}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        sourceCurrencyCode: event.target.value.toUpperCase().slice(0, 3),
                      }))
                    }
                    maxLength={3}
                    placeholder="USD"
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <FieldLabel>Billing period</FieldLabel>
                <select
                  value={draft.billingPeriod}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      billingPeriod: event.target.value as RateBillingPeriod,
                    }))
                  }
                >
                  {RATE_BILLING_PERIOD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {billingPeriodLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 rounded-[16px] border border-[var(--border-2)] bg-white px-4 py-3 text-sm text-[var(--text-3)]">
              Axis preview: {formatDraftRate(draft)}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void saveDraft()}
                loading={saving}
              >
                {isEditingExisting ? "Save changes" : "Add person"}
              </Button>

              {isEditingExisting ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  leadingIcon={<TrashIcon className="h-4 w-4" />}
                  onClick={() => void archiveSelectedPerson()}
                  loading={archiving}
                >
                  Archive
                </Button>
              ) : null}
            </div>

            {statusMessage ? (
              <p
                className={cn(
                  "mt-4 text-sm",
                  statusIsError ? "text-[#b42318]" : "text-[var(--text-3)]",
                )}
              >
                {statusMessage}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function DeveloperTab({
  apiKeyConfigured,
}: {
  apiKeyConfigured: boolean;
}) {
  return (
    <div className="space-y-6">
      <ApiSection apiKeyConfigured={apiKeyConfigured} />
    </div>
  );
}

function ApiSection({
  apiKeyConfigured,
}: {
  apiKeyConfigured: boolean;
}) {
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://docs-by-gitwork.vercel.app";

  const [copiedUrl, setCopiedUrl] = useState(false);

  function copy(text: string, setCopied: (value: boolean) => void) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="app-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="app-eyebrow">Developer</p>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            API access
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-3)]">
            Use these endpoints to connect Axis and other external clients to Docs by Gitwork. The
            web app uses a secure server-set session cookie, while external clients authenticate with{" "}
            <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-2)]">
              Authorization: Bearer &lt;key&gt;
            </code>
            .
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

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-4">
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
            <FieldLabel>API authentication</FieldLabel>
            {apiKeyConfigured ? (
              <p className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-2)]">
                Server key configured. Manage the bearer token from Vercel project settings instead
                of exposing it in the browser.
              </p>
            ) : (
              <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-3 py-2.5 text-sm text-[var(--text-4)]">
                No API key configured. Set <code className="font-mono">API_KEY</code> in your
                environment variables. For backward compatibility, the app will also read{" "}
                <code className="font-mono">NEXT_PUBLIC_API_KEY</code> until you migrate.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Endpoints
          </p>
          <div className="mt-3 space-y-1.5 font-mono text-xs text-[var(--text-3)]">
            {([
              ["GET", "/api/health", "Health check"],
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
              ["GET", "/api/rate-card/people", "List people and rates"],
              ["POST", "/api/rate-card/people", "Create rate-card person"],
              ["GET", "/api/rate-card/people/:id", "Get rate-card person"],
              ["PATCH", "/api/rate-card/people/:id", "Update rate-card person"],
              ["DELETE", "/api/rate-card/people/:id", "Archive rate-card person"],
              ["GET", "/api/templates", "List templates"],
            ] as const).map(([method, path, label]) => (
              <div key={`${method}-${path}`} className="flex items-baseline gap-2">
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
      </div>
    </section>
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
  return <span className="block text-sm font-medium text-[var(--text-2)]">{children}</span>;
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

function makeEmptyRateCardDraft(): RateCardDraft {
  return {
    name: "",
    area: "",
    sourceRate: "",
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  };
}

function draftFromPerson(person: RateCardPersonRecord): RateCardDraft {
  return {
    name: person.name,
    area: person.area,
    sourceRate: person.sourceRate.toString(),
    sourceCurrencyCode: person.sourceCurrencyCode,
    billingPeriod: person.billingPeriod,
  };
}

function billingPeriodLabel(period: RateBillingPeriod) {
  switch (period) {
    case "DAY":
      return "Per day";
    case "WEEK":
      return "Per week";
    case "MONTH":
      return "Per month";
  }
}

function formatSourceRate(
  sourceRate: number,
  sourceCurrencyCode: string,
  billingPeriod: RateBillingPeriod,
) {
  return `${formatCurrencyValue(sourceRate, sourceCurrencyCode)} · ${billingPeriodLabel(billingPeriod)}`;
}

function formatDraftRate(draft: RateCardDraft) {
  const sourceRate = Number(draft.sourceRate);
  if (Number.isNaN(sourceRate) || sourceRate <= 0) {
    return "Add a valid rate to preview the source pricing.";
  }

  return formatSourceRate(sourceRate, draft.sourceCurrencyCode || "USD", draft.billingPeriod);
}

function formatCurrencyValue(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencyCode.toUpperCase()} ${value.toFixed(2)}`;
  }
}
