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
import { createRateCardPerson, deleteRateCardPerson, listRateCardPeople, updateRateCardPerson, getIntegrations, saveIntegrations, fetchProviderModels, type IntegrationsResponse, type ModelOption } from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import { useLocalSettings } from "@/lib/local-settings";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import type { RateBillingPeriod, RateCardPersonRecord } from "@/types/rate-card";

type TabId = "general" | "branding" | "content" | "people" | "integrations" | "developer";

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
  { id: "integrations", label: "Integrations" },
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
      {activeTab === "integrations" && <IntegrationsTab />}
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

  async function archiveSelectedPerson(personId = selectedPersonId) {
    if (!personId) {
      return;
    }

    setArchiving(true);
    setStatusMessage(null);

    try {
      await deleteRateCardPerson(personId);
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

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,400px)]">
          <section className="overflow-hidden rounded-[20px] border border-[var(--border-2)] bg-[var(--surface-0)] shadow-[var(--shadow-xs)]">
            <div className="border-b border-[var(--border-2)] px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-[var(--text-1)]">Roster</h3>
                    <span className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                      {people.length} people
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-3)]">
                    Shared people and source rates for every connected proposal builder.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className="relative block">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by name, area, or currency"
                    className="w-full pl-10"
                  />
                </label>
              </div>
            </div>

            <div className="max-h-[640px] overflow-y-auto p-3">
              {loading ? (
                <div className="rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-8 text-sm text-[var(--text-3)]">
                  Loading People & Rates…
                </div>
              ) : filteredPeople.length > 0 ? (
                <div className="space-y-2">
                  {filteredPeople.map((person) => {
                    const selected = person.id === selectedPersonId;

                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => selectPerson(person)}
                        className={cn(
                          "group relative w-full overflow-hidden rounded-[18px] border px-4 py-4 text-left transition",
                          selected
                            ? "border-[var(--brand-500)] bg-[var(--surface-brand-soft)] shadow-[var(--shadow-xs)]"
                            : "border-transparent hover:border-[var(--border-2)] hover:bg-[var(--surface-1)]",
                        )}
                        aria-pressed={selected}
                      >
                        <span
                          className={cn(
                            "absolute inset-y-3 left-0 w-1 rounded-full transition",
                            selected ? "bg-[var(--brand-500)]" : "bg-transparent",
                          )}
                        />

                        <div className="flex items-start gap-4 pl-2">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-2)] bg-white text-sm font-semibold text-[var(--text-2)]">
                            {initialsForPerson(person.name)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-[var(--text-1)]">
                                {person.name}
                              </span>
                              {person.seedIdentifier ? (
                                <span className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                                  Default
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">
                              {person.area}
                            </p>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-[var(--text-1)]">
                                {formatCurrencyValue(person.sourceRate, person.sourceCurrencyCode)}
                              </span>
                              <span className="text-sm text-[var(--text-4)]">•</span>
                              <span className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
                                {billingPeriodLabel(person.billingPeriod)}
                              </span>
                              <span className="text-sm text-[var(--text-4)]">•</span>
                              <span className="text-sm text-[var(--text-3)]">
                                Updated {formatDate(person.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-8 text-sm text-[var(--text-3)]">
                  {people.length === 0
                    ? "No people saved yet. Add your first team member to start building the shared roster."
                    : "No roster entries match that search."}
                </div>
              )}
            </div>
          </section>

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
                <select
                  value={COMMON_CURRENCIES.includes(draft.sourceCurrencyCode as (typeof COMMON_CURRENCIES)[number]) ? draft.sourceCurrencyCode : "CUSTOM"}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === "CUSTOM") {
                      setDraft((current) => ({
                        ...current,
                        sourceCurrencyCode: current.sourceCurrencyCode.trim() || "USD",
                      }));
                      return;
                    }

                    setDraft((current) => ({
                      ...current,
                      sourceCurrencyCode: nextValue,
                    }));
                  }}
                >
                  {COMMON_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                  <option value="CUSTOM">Custom</option>
                </select>
                {!COMMON_CURRENCIES.includes(draft.sourceCurrencyCode as (typeof COMMON_CURRENCIES)[number]) ? (
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
                ) : null}
                <p className="text-xs leading-5 text-[var(--text-3)]">
                  This is the currency the person is actually priced in. Axis converts it later for
                  proposal pricing, so you only need a custom code when it is not already in the list.
                </p>
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

            <div className="mt-5 space-y-2 rounded-[16px] border border-[var(--border-2)] bg-white px-4 py-3 text-sm text-[var(--text-3)]">
              <p>
                Stored source pricing: <span className="font-medium text-[var(--text-1)]">{formatDraftRate(draft)}</span>
              </p>
              {showAxisConversionNote(draft) ? (
                <p className="text-xs leading-5 text-[var(--text-3)]">
                  Axis converts this into a GBP day rate inside the proposal builder, so the roster
                  keeps the original commercial data and the proposal keeps the client-facing GBP rate.
                </p>
              ) : null}
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

type AiProvider = "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";

const PROVIDERS: { id: AiProvider; label: string; hint: string; keyPlaceholder: string; envVar: string; defaultModel: string }[] = [
  { id: "ANTHROPIC", label: "Claude (Anthropic)", hint: "claude-opus-4-6 by default.", keyPlaceholder: "sk-ant-api03-…", envVar: "ANTHROPIC_API_KEY", defaultModel: "claude-opus-4-6" },
  { id: "OPENAI", label: "OpenAI", hint: "gpt-4o by default.", keyPlaceholder: "sk-…", envVar: "OPENAI_API_KEY", defaultModel: "gpt-4o" },
  { id: "GEMINI", label: "Gemini (Google)", hint: "gemini-2.0-flash by default.", keyPlaceholder: "AIza…", envVar: "GEMINI_API_KEY", defaultModel: "gemini-2.0-flash" },
  { id: "LOCAL", label: "Local LLM (Ollama / LM Studio)", hint: "Point to any OpenAI-compatible server.", keyPlaceholder: "(optional API key)", envVar: "", defaultModel: "llama3.1" },
];

function KeyStatus({ source, masked }: { source: "env" | "database" | null; masked: string | null }) {
  if (source === "env") return (
    <span className="text-xs font-medium text-green-700">
      ✓ Set via environment variable — <span className="font-mono">{masked}</span>
    </span>
  );
  if (source === "database") return (
    <span className="text-xs font-medium text-green-700">✓ Saved — <span className="font-mono">{masked}</span></span>
  );
  return <span className="text-xs text-[var(--text-4)]">Not configured</span>;
}

function ModelPicker({
  provider,
  currentModel,
  selectedModel,
  onSelect,
  disabled,
}: {
  provider: AiProvider;
  currentModel: string;
  selectedModel: string;
  onSelect: (model: string) => void;
  disabled: boolean;
}) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function loadModels() {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchProviderModels(provider);
      setModels(list);
      setLoaded(true);
      // If the current model exists in the list, pre-select it
      if (!selectedModel && currentModel) {
        onSelect(currentModel);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <FieldLabel>Model</FieldLabel>
        <button
          type="button"
          onClick={loadModels}
          disabled={loading || disabled}
          className="flex items-center gap-1 text-xs text-[var(--brand-600)] hover:text-[var(--brand-700)] disabled:opacity-50"
        >
          <ArrowPathIcon className={cn("h-3 w-3", loading && "animate-spin")} />
          {loading ? "Loading…" : loaded ? "Refresh" : "Load models"}
        </button>
      </div>
      {loaded && models.length > 0 ? (
        <select
          className="app-select text-sm"
          value={selectedModel || currentModel}
          onChange={(e) => onSelect(e.target.value)}
          disabled={disabled}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="app-input text-sm"
          placeholder={currentModel}
          value={selectedModel}
          onChange={(e) => onSelect(e.target.value)}
          disabled={disabled}
        />
      )}
      {loadError && <p className="text-xs text-amber-600">{loadError}</p>}
      <p className="text-xs text-[var(--text-4)]">Active: {currentModel}</p>
    </div>
  );
}

function IntegrationsTab() {
  const [config, setConfig] = useState<IntegrationsResponse | null>(null);
  const [activeProvider, setActiveProvider] = useState<AiProvider>("ANTHROPIC");
  const [inputs, setInputs] = useState({ key: "", model: "", url: "", localModel: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIntegrations()
      .then((data) => {
        setConfig(data);
        setActiveProvider(data.aiProvider);
      })
      .catch(() => {});
  }, []);

  // Reset model input when switching providers
  useEffect(() => {
    setInputs({ key: "", model: "", url: "", localModel: "" });
  }, [activeProvider]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Parameters<typeof saveIntegrations>[0] = { aiProvider: activeProvider };
      if (activeProvider === "ANTHROPIC") {
        if (inputs.key) payload.anthropicApiKey = inputs.key;
        if (inputs.model) payload.anthropicModel = inputs.model;
      }
      if (activeProvider === "OPENAI") {
        if (inputs.key) payload.openaiApiKey = inputs.key;
        if (inputs.model) payload.openaiModel = inputs.model;
      }
      if (activeProvider === "GEMINI") {
        if (inputs.key) payload.geminiApiKey = inputs.key;
        if (inputs.model) payload.geminiModel = inputs.model;
      }
      if (activeProvider === "LOCAL") {
        if (inputs.url) payload.localLlmUrl = inputs.url;
        if (inputs.localModel) payload.localLlmModel = inputs.localModel;
      }
      await saveIntegrations(payload);
      setSaved(true);
      setInputs({ key: "", model: "", url: "", localModel: "" });
      const updated = await getIntegrations();
      setConfig(updated);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const provider = PROVIDERS.find((p) => p.id === activeProvider)!;
  const isActive = config?.aiProvider === activeProvider;
  const keySource = activeProvider === "ANTHROPIC" ? config?.anthropicKeySource
    : activeProvider === "OPENAI" ? config?.openaiKeySource
    : activeProvider === "GEMINI" ? config?.geminiKeySource
    : null;
  const maskedKey = activeProvider === "ANTHROPIC" ? config?.anthropicKeyMasked
    : activeProvider === "OPENAI" ? config?.openaiKeyMasked
    : activeProvider === "GEMINI" ? config?.geminiKeyMasked
    : null;
  const currentModel = activeProvider === "ANTHROPIC" ? (config?.anthropicModel ?? "claude-opus-4-6")
    : activeProvider === "OPENAI" ? (config?.openaiModel ?? "gpt-4o")
    : activeProvider === "GEMINI" ? (config?.geminiModel ?? "gemini-2.0-flash")
    : (config?.localLlmModel ?? "llama3.1");

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <p className="app-eyebrow">AI provider</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          AI analysis engine
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-3)]">
          Pulse uses AI to generate gap analysis, build opportunities, and the scaling roadmap. Choose
          your provider and model. Without any key, Pulse still runs all automated checks and returns mock analysis.
        </p>

        {!config ? (
          <p className="mt-6 text-sm text-[var(--text-4)]">Loading…</p>
        ) : (
          <div className="mt-6 space-y-5">
            {/* Provider selector */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {PROVIDERS.map((p) => {
                const pKeySource = p.id === "ANTHROPIC" ? config.anthropicKeySource
                  : p.id === "OPENAI" ? config.openaiKeySource
                  : p.id === "GEMINI" ? config.geminiKeySource
                  : null;
                const configured = Boolean(pKeySource) || (p.id === "LOCAL" && Boolean(config.localLlmUrl));
                const isSelected = activeProvider === p.id;
                const isCurrentActive = config.aiProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveProvider(p.id)}
                    className={cn(
                      "relative rounded-[12px] border p-4 text-left transition",
                      isSelected
                        ? "border-[var(--brand-500)] bg-[var(--brand-50)]"
                        : "border-[var(--border-2)] bg-white hover:bg-[var(--surface-1)]",
                    )}
                  >
                    {isCurrentActive && (
                      <span className="absolute right-3 top-3 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">ACTIVE</span>
                    )}
                    <p className={cn("text-sm font-semibold", isSelected ? "text-[var(--brand-700)]" : "text-[var(--text-1)]")}>{p.label}</p>
                    <p className="mt-1 text-xs text-[var(--text-4)]">{configured ? "✓ Configured" : "Not configured"}</p>
                  </button>
                );
              })}
            </div>

            {/* Selected provider config */}
            <div className="rounded-[14px] border border-[var(--border-2)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-1)]">{provider.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-3)]">{provider.hint}</p>
                </div>
                {isActive && (
                  <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Currently active</span>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {activeProvider !== "LOCAL" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <FieldLabel>API key</FieldLabel>
                      <KeyStatus source={keySource ?? null} masked={maskedKey ?? null} />
                    </div>
                    {keySource !== "env" && (
                      <input
                        type="password"
                        className="app-input font-mono text-sm"
                        placeholder={provider.keyPlaceholder}
                        value={inputs.key}
                        onChange={(e) => setInputs((s) => ({ ...s, key: e.target.value }))}
                        disabled={saving}
                      />
                    )}
                    {provider.envVar && (
                      <p className="text-xs text-[var(--text-4)]">
                        Or set <code className="font-mono">{provider.envVar}</code> as an environment variable (takes precedence).
                      </p>
                    )}
                  </div>
                )}

                {/* Model picker for all providers */}
                {activeProvider !== "LOCAL" ? (
                  <ModelPicker
                    key={activeProvider}
                    provider={activeProvider}
                    currentModel={currentModel}
                    selectedModel={inputs.model}
                    onSelect={(m) => setInputs((s) => ({ ...s, model: m }))}
                    disabled={saving}
                  />
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <FieldLabel>Base URL</FieldLabel>
                      <input
                        className="app-input font-mono text-sm"
                        placeholder="http://localhost:11434/v1"
                        value={inputs.url}
                        onChange={(e) => setInputs((s) => ({ ...s, url: e.target.value }))}
                        disabled={saving}
                      />
                      <p className="text-xs text-[var(--text-4)]">
                        Current: {config.localLlmUrl || "not set"} — Ollama, LM Studio, and any OpenAI-compatible server work.
                      </p>
                    </div>
                    <ModelPicker
                      key="LOCAL"
                      provider="LOCAL"
                      currentModel={currentModel}
                      selectedModel={inputs.localModel}
                      onSelect={(m) => setInputs((s) => ({ ...s, localModel: m }))}
                      disabled={saving}
                    />
                  </>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                >
                  {saved ? "Saved ✓" : isActive ? "Save changes" : `Save and switch to ${provider.label}`}
                </Button>
              </div>
            </div>
          </div>
        )}
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
            Use these endpoints to connect Docs, Proof, CodeClear, and external clients to Docs by
            Gitwork. The web app uses a secure server-set session cookie, while external clients
            authenticate with{" "}
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
              ["GET", "/api/clients", "List clients"],
              ["POST", "/api/clients", "Create client"],
              ["GET", "/api/clients/:slug", "Get client"],
              ["PATCH", "/api/clients/:slug", "Update client"],
              ["GET", "/api/rate-card/people", "List people and rates"],
              ["POST", "/api/rate-card/people", "Create rate-card person"],
              ["GET", "/api/rate-card/people/:id", "Get rate-card person"],
              ["PATCH", "/api/rate-card/people/:id", "Update rate-card person"],
              ["DELETE", "/api/rate-card/people/:id", "Archive rate-card person"],
              ["GET", "/api/codeclear/stats", "CodeClear overview stats"],
              ["GET", "/api/codeclear/candidates", "List CodeClear candidates"],
              ["POST", "/api/codeclear/candidates", "Create CodeClear candidate"],
              ["PATCH", "/api/codeclear/candidates", "Bulk stage or re-check update"],
              ["GET", "/api/codeclear/candidates/:id", "Get CodeClear candidate"],
              ["PATCH", "/api/codeclear/candidates/:id", "Update CodeClear candidate"],
              ["DELETE", "/api/codeclear/candidates/:id", "Delete CodeClear candidate"],
              ["POST", "/api/codeclear/candidates/:id/notes", "Add CodeClear note"],
              ["PUT", "/api/codeclear/candidates/:id/score", "Finalize CodeClear score"],
              ["GET", "/api/codeclear/candidates/:id/github-analysis/runs", "List analysis runs"],
              ["POST", "/api/codeclear/candidates/:id/github-analysis/runs", "Run GitHub analysis"],
              ["POST", "/api/codeclear/candidates/:id/github-analysis/runs/:runId/apply", "Apply analysis draft"],
              ["GET", "/api/codeclear/candidates/:id/scorecard", "Export CodeClear scorecard"],
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
                        : method === "PUT"
                          ? "text-violet-600"
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
        className="app-textarea"
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

function showAxisConversionNote(draft: RateCardDraft) {
  const sourceRate = Number(draft.sourceRate);
  if (Number.isNaN(sourceRate) || sourceRate <= 0) {
    return false;
  }

  return draft.sourceCurrencyCode.trim().toUpperCase() !== "GBP" || draft.billingPeriod !== "DAY";
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

function initialsForPerson(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
