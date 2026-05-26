"use client";

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  apiFetch,
  createRateCardPerson, deleteRateCardPerson, listRateCardPeople, updateRateCardPerson,
  getIntegrations, saveIntegrations, fetchProviderModels,
  listTeamMembers, createTeamMember, updateTeamMember, deleteTeamMember, resetTeamMemberPassword,
  type IntegrationsResponse, type ModelOption, type TeamMember,
} from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import { useLocalSettings } from "@/lib/local-settings";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import type { RateBillingPeriod, RateCardPersonRecord } from "@/types/rate-card";
import { MODULE_PERMISSIONS } from "@/types/auth";

type TabId = "general" | "branding" | "content" | "people" | "integrations" | "team" | "developer";

interface RateCardDraft {
  name: string;
  area: string;
  sourceRate: string;
  sourceCurrencyCode: string;
  billingPeriod: RateBillingPeriod;
}

const TABS: { id: TabId; label: string; adminOnly?: boolean }[] = [
  { id: "general", label: "General" },
  { id: "branding", label: "Branding" },
  { id: "content", label: "Content" },
  { id: "people", label: "People & Rates" },
  { id: "integrations", label: "Integrations" },
  { id: "team", label: "Team", adminOnly: true },
  { id: "developer", label: "Developer", adminOnly: true },
];

const COMMON_CURRENCIES = ["USD", "GBP", "EUR", "AED", "SAR", "CAD", "AUD"] as const;
const RATE_BILLING_PERIOD_OPTIONS: RateBillingPeriod[] = ["DAY", "WEEK", "MONTH"];

export function SettingsPanel({
  apiKeyConfigured,
}: {
  apiKeyConfigured: boolean;
}) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [activeTab, setActiveTab] = useState<TabId>("general");

  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--border-2)]">
        <nav className="-mb-px flex flex-wrap gap-0">
          {visibleTabs.map((tab) => (
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
      {activeTab === "team" && isAdmin && <TeamTab currentUserId={session?.user?.id ?? ""} />}
      {activeTab === "developer" && isAdmin && <DeveloperTab apiKeyConfigured={apiKeyConfigured} />}
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
                className="grid gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto]"
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
          <section className="overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] shadow-[var(--shadow-xs)]">
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
                <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-8 text-sm text-[var(--text-3)]">
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
                          "group relative w-full overflow-hidden rounded-[10px] border px-4 py-4 text-left transition",
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
                <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-8 text-sm text-[var(--text-3)]">
                  {people.length === 0
                    ? "No people saved yet. Add your first team member to start building the shared roster."
                    : "No roster entries match that search."}
                </div>
              )}
            </div>
          </section>

          <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-5">
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

            <div className="mt-5 space-y-2 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3 text-sm text-[var(--text-3)]">
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
  { id: "ANTHROPIC", label: "Claude", hint: "claude-sonnet-4-6 by default.", keyPlaceholder: "sk-ant-api03-…", envVar: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4-6" },
  { id: "OPENAI", label: "OpenAI", hint: "gpt-4o by default.", keyPlaceholder: "sk-…", envVar: "OPENAI_API_KEY", defaultModel: "gpt-4o" },
  { id: "GEMINI", label: "Gemini (Google)", hint: "gemini-2.0-flash by default.", keyPlaceholder: "AIza…", envVar: "GEMINI_API_KEY", defaultModel: "gemini-2.0-flash" },
  { id: "LOCAL", label: "Local LLM (Ollama / LM Studio)", hint: "Point to any OpenAI-compatible server.", keyPlaceholder: "(optional API key)", envVar: "", defaultModel: "llama3.1" },
];


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

function ProviderRow({
  provider,
  config,
  onSaved,
}: {
  provider: typeof PROVIDERS[number];
  config: IntegrationsResponse;
  onSaved: (updated: IntegrationsResponse) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputs, setInputs] = useState({ key: "", model: "", url: "", localModel: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keySource = provider.id === "ANTHROPIC" ? config.anthropicKeySource
    : provider.id === "OPENAI" ? config.openaiKeySource
    : provider.id === "GEMINI" ? config.geminiKeySource
    : null;
  const maskedKey = provider.id === "ANTHROPIC" ? config.anthropicKeyMasked
    : provider.id === "OPENAI" ? config.openaiKeyMasked
    : provider.id === "GEMINI" ? config.geminiKeyMasked
    : null;
  const currentModel = provider.id === "ANTHROPIC" ? (config.anthropicModel ?? "claude-sonnet-4-6")
    : provider.id === "OPENAI" ? (config.openaiModel ?? "gpt-4o")
    : provider.id === "GEMINI" ? (config.geminiModel ?? "gemini-2.0-flash")
    : (config.localLlmModel ?? "llama3.1");
  const configured = Boolean(keySource) || (provider.id === "LOCAL" && Boolean(config.localLlmUrl));

  function openEdit() {
    setInputs({
      key: maskedKey ?? "",
      model: currentModel,
      url: config.localLlmUrl ?? "",
      localModel: currentModel,
    });
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // A key is "changed" only if it's non-empty and contains no masking bullets (•).
      // Masked values like "AIzaSyC•••••••••3tc8" must never be written back to the DB.
      const keyChanged = inputs.key.length > 0 && !inputs.key.includes("•");
      // Never include aiProvider here — the dropdown at the top controls that exclusively.
      const payload: Parameters<typeof saveIntegrations>[0] = {};
      if (provider.id === "ANTHROPIC") {
        if (keyChanged) payload.anthropicApiKey = inputs.key;
        if (inputs.model) payload.anthropicModel = inputs.model;
      }
      if (provider.id === "OPENAI") {
        if (keyChanged) payload.openaiApiKey = inputs.key;
        if (inputs.model) payload.openaiModel = inputs.model;
      }
      if (provider.id === "GEMINI") {
        if (keyChanged) payload.geminiApiKey = inputs.key;
        if (inputs.model) payload.geminiModel = inputs.model;
      }
      if (provider.id === "LOCAL") {
        if (inputs.url) payload.localLlmUrl = inputs.url;
        if (inputs.localModel) payload.localLlmModel = inputs.localModel;
      }
      if (Object.keys(payload).length > 0) {
        await saveIntegrations(payload);
      }
      const updated = await getIntegrations();
      onSaved(updated);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setEditing(false);
      }, 1200);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-white">
      {/* Row summary — always visible */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-1)]">{provider.label}</p>
          <p className="mt-0.5 text-xs text-[var(--text-4)]">
            {configured
              ? keySource === "env"
                ? `Key set via environment variable — ${maskedKey}`
                : maskedKey
                  ? `Key saved — ${maskedKey} · Model: ${currentModel}`
                  : `Configured · Model: ${currentModel}`
              : provider.id === "LOCAL"
                ? "Not configured — add a base URL to enable"
                : "Not configured"}
          </p>
        </div>
        {!editing && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openEdit}
          >
            Edit
          </Button>
        )}
      </div>

      {/* Inline edit panel */}
      {editing && (
        <div className="border-t border-[var(--border-2)] px-5 pb-5 pt-4 space-y-3">
          {provider.id !== "LOCAL" && (
            <div className="space-y-1.5">
              <FieldLabel>API key</FieldLabel>
              {keySource === "env" ? (
                <p className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--text-3)]">
                  {maskedKey} — set via environment variable, cannot be overridden here
                </p>
              ) : (
                <input
                  type="text"
                  className="app-input font-mono text-sm"
                  placeholder={provider.keyPlaceholder}
                  value={inputs.key}
                  onChange={(e) => setInputs((s) => ({ ...s, key: e.target.value }))}
                  disabled={saving}
                />
              )}
              {provider.envVar && keySource !== "env" && (
                <p className="text-xs text-[var(--text-4)]">
                  Or set <code className="font-mono">{provider.envVar}</code> as an environment variable (takes precedence).
                </p>
              )}
            </div>
          )}

          {provider.id !== "LOCAL" ? (
            <ModelPicker
              key={provider.id}
              provider={provider.id}
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

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={saving}
            >
              {saved ? "Saved ✓" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationsTab() {
  const [config, setConfig] = useState<IntegrationsResponse | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);

  useEffect(() => {
    getIntegrations().then(setConfig).catch(() => {});
  }, []);

  async function handleProviderChange(provider: AiProvider) {
    if (!config) return;
    const optimistic = { ...config, aiProvider: provider };
    setConfig(optimistic);
    setSavingProvider(true);
    try {
      await saveIntegrations({ aiProvider: provider });
      const fresh = await getIntegrations();
      setConfig(fresh);
    } catch {
      setConfig(config); // revert on error
    } finally {
      setSavingProvider(false);
    }
  }

  const activeProvider = config ? PROVIDERS.find((p) => p.id === config.aiProvider) : null;

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <p className="app-eyebrow">AI provider</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          AI analysis engine
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-3)]">
          Select the AI provider Pulse uses for all scans. Only the selected provider is used — no fallbacks.
          Add its API key and model below.
        </p>

        {/* ── Default provider selector ──────────────────────────── */}
        <div className="mt-5 rounded-[10px] border-2 border-[var(--brand-500)] bg-[var(--surface-brand-soft)] p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-600)]">
                Default AI provider
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">
                All new scans use this provider exclusively. Change it and all future scans switch immediately.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!config ? (
                <p className="text-sm text-[var(--text-4)]">Loading…</p>
              ) : (
                <select
                  className="app-select min-w-[220px] text-sm font-semibold"
                  value={config.aiProvider}
                  onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
                  disabled={savingProvider}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}
              {savingProvider && (
                <span className="text-xs text-[var(--text-4)]">Saving…</span>
              )}
            </div>
          </div>
          {activeProvider && config && (
            <p className="mt-3 text-xs text-[var(--text-3)]">
              Active: <span className="font-semibold text-[var(--text-1)]">{activeProvider.label}</span>
              {(() => {
                const model = config.aiProvider === "ANTHROPIC" ? (config.anthropicModel ?? "claude-sonnet-4-6")
                  : config.aiProvider === "OPENAI" ? (config.openaiModel ?? "gpt-4o")
                  : config.aiProvider === "GEMINI" ? (config.geminiModel ?? "gemini-2.0-flash")
                  : (config.localLlmModel ?? "llama3.1");
                return <> · Model: <span className="font-mono font-medium text-[var(--text-1)]">{model}</span></>;
              })()}
            </p>
          )}
        </div>

        {/* ── Per-provider credential config ─────────────────────── */}
        {!config ? null : (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-[var(--text-4)]">Configure API keys and models for each provider below.</p>
            {PROVIDERS.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                config={config}
                onSaved={setConfig}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Google Workspace ──────────────────────────────────────── */}
      <GoogleWorkspaceSection config={config} onSaved={setConfig} />

      {/* ── Slack ─────────────────────────────────────────────────── */}
      <SlackSection config={config} onSaved={setConfig} />
    </div>
  );
}

function TeamTab({ currentUserId }: { currentUserId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [resetMember, setResetMember] = useState<TeamMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTeamMembers();
      setMembers(data.members);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="app-eyebrow">Access</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              Team members
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
              Manage who can access Foundry. Admins have full access. Staff access is limited to
              modules you enable for them.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="shrink-0"
          >
            <PlusIcon className="h-4 w-4" />
            Add member
          </Button>
        </div>

        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-[var(--text-4)]">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-[var(--text-4)]">No team members yet.</p>
          ) : (
            <div className="divide-y divide-[var(--border-2)]">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--mist)] text-sm font-semibold text-[var(--brand-700)]">
                    {(m.name ?? m.email)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-1)]">
                      {m.name ?? "—"}
                    </p>
                    <p className="truncate text-xs text-[var(--text-4)]">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        m.role === "ADMIN"
                          ? "bg-[var(--brand-700)] text-white"
                          : "bg-[var(--surface-1)] text-[var(--text-3)]",
                      )}
                    >
                      {m.role}
                    </span>
                    {m.role === "STAFF" && m.permissions.length > 0 && (
                      <span className="text-xs text-[var(--text-4)]">
                        {m.permissions.length} module{m.permissions.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditMember(m)}
                      className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
                      title="Edit"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetMember(m)}
                      className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
                      title="Reset password"
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                    </button>
                    {m.userId !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(m)}
                        className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                        title="Remove"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {showAddModal && (
        <AddMemberModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); void reload(); }}
        />
      )}

      {editMember && (
        <EditMemberModal
          member={editMember}
          onClose={() => setEditMember(null)}
          onSaved={() => { setEditMember(null); void reload(); }}
        />
      )}

      {resetMember && (
        <ResetPasswordModal
          member={resetMember}
          onClose={() => setResetMember(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          member={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); void reload(); }}
        />
      )}
    </div>
  );
}

function AddMemberModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePermission(id: string) {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createTeamMember({ name, email, password, role, permissions });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TeamModal title="Add team member" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="app-field-label">Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="app-input w-full"
              placeholder="Jane Smith"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="app-field-label">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              className="app-input w-full"
              placeholder="jane@gitwork.co.uk"
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="app-field-label">Initial password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            className="app-input w-full"
            placeholder="Min. 8 characters"
          />
        </label>

        <fieldset className="space-y-1.5">
          <span className="app-field-label">Role</span>
          <div className="flex gap-3">
            {(["ADMIN", "STAFF"] as const).map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-[var(--text-2)]">{r}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {role === "STAFF" && (
          <fieldset className="space-y-2">
            <span className="app-field-label">Module access</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODULE_PERMISSIONS.map((mod) => (
                <label
                  key={mod.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2.5 transition",
                    permissions.includes(mod.id)
                      ? "border-[var(--brand-700)] bg-[var(--mist)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] text-[var(--text-3)] hover:border-[var(--border-1)]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={permissions.includes(mod.id)}
                    onChange={() => togglePermission(mod.id)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{mod.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {error && (
          <p className="rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? "Adding…" : "Add member"}
          </Button>
        </div>
      </form>
    </TeamModal>
  );
}

function EditMemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(member.name ?? "");
  const [role, setRole] = useState<"ADMIN" | "STAFF">(member.role);
  const [permissions, setPermissions] = useState<string[]>(member.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePermission(id: string) {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateTeamMember(member.userId, {
        name,
        role,
        permissions: role === "ADMIN" ? [] : permissions,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TeamModal title={`Edit — ${member.name ?? member.email}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="app-field-label">Full name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="app-input w-full"
          />
        </label>

        <fieldset className="space-y-1.5">
          <span className="app-field-label">Role</span>
          <div className="flex gap-3">
            {(["ADMIN", "STAFF"] as const).map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="edit-role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-[var(--text-2)]">{r}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {role === "STAFF" && (
          <fieldset className="space-y-2">
            <span className="app-field-label">Module access</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODULE_PERMISSIONS.map((mod) => (
                <label
                  key={mod.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2.5 transition",
                    permissions.includes(mod.id)
                      ? "border-[var(--brand-700)] bg-[var(--mist)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] text-[var(--text-3)] hover:border-[var(--border-1)]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={permissions.includes(mod.id)}
                    onChange={() => togglePermission(mod.id)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{mod.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {error && (
          <p className="rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </TeamModal>
  );
}

function ResetPasswordModal({
  member,
  onClose,
}: {
  member: TeamMember;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await resetTeamMemberPassword(member.userId, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TeamModal title={`Reset password — ${member.name ?? member.email}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="rounded-[10px] bg-[var(--success-50)] px-4 py-3 text-sm text-[var(--success-500)]">
            Password reset successfully. Share the new password with {member.name ?? member.email}.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-[var(--text-3)]">
            Set a new password for <strong>{member.name ?? member.email}</strong>. They will need to
            use this to sign in next time.
          </p>

          <label className="block space-y-1.5">
            <span className="app-field-label">New password</span>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              required
              minLength={8}
              className="app-input w-full"
              placeholder="Min. 8 characters"
            />
          </label>

          {error && (
            <p className="rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={saving || newPassword.length < 8}>
              {saving ? "Resetting…" : "Reset password"}
            </Button>
          </div>
        </form>
      )}
    </TeamModal>
  );
}

function ConfirmDeleteModal({
  member,
  onClose,
  onDeleted,
}: {
  member: TeamMember;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteTeamMember(member.userId);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
      setDeleting(false);
    }
  }

  return (
    <TeamModal title="Remove team member" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-3)]">
          Remove <strong>{member.name ?? member.email}</strong> from the team? They will
          immediately lose access to Foundry. This cannot be undone.
        </p>

        {error && (
          <p className="rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="bg-[var(--danger-500)] text-white hover:bg-red-600"
          >
            {deleting ? "Removing…" : "Remove member"}
          </Button>
        </div>
      </div>
    </TeamModal>
  );
}

function TeamModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="app-dialog-backdrop absolute inset-0" onClick={onClose} />
      <div className="app-dialog-panel relative z-10 w-full max-w-lg p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GoogleWorkspaceSection({
  config,
  onSaved,
}: {
  config: IntegrationsResponse | null;
  onSaved: (updated: IntegrationsResponse) => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [oauthSuccess, setOauthSuccess] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail_connected") === "1") setOauthSuccess(true);
    if (params.get("gmail_error")) setOauthError(params.get("gmail_error"));
  }, []);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await apiFetch("/api/integrations/gmail/disconnect", { method: "POST" });
      const updated = await getIntegrations();
      onSaved(updated);
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = config?.googleOAuthConnected ?? false;

  return (
    <section className="app-card p-6">
      <p className="app-eyebrow">Google Workspace</p>
      <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
        Gmail
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-3)]">
        Connect your Gmail account so Care can pull in forwarded client emails automatically.
        Emails forwarded to your intake address (e.g. <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-[11px]">support+client@gitwork.co.uk</code>) will appear as conversations in Care.
      </p>

      <div className="mt-5">
        {oauthSuccess && !connected && (
          <div className="mb-4 flex items-center gap-2 rounded-[6px] bg-green-50 px-3 py-2 text-xs text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Gmail connected successfully.
          </div>
        )}
        {oauthError && (
          <div className="mb-4 flex items-center gap-2 rounded-[6px] bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Gmail connection failed: {oauthError}. Please try again.
          </div>
        )}
        {connected ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-[6px] bg-green-50 px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-xs font-medium text-green-700">Gmail connected</span>
            </div>
            <button
              onClick={() => void handleDisconnect()}
              disabled={disconnecting}
              className="text-xs text-[var(--text-4)] underline hover:text-[var(--text-2)] disabled:opacity-40"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <a
            href="/api/integrations/gmail/connect"
            className="app-button app-button-secondary inline-flex items-center gap-2.5 px-4 py-2 text-sm font-medium"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </a>
        )}

        {!connected && (
          <p className="mt-3 text-[11px] text-[var(--text-4)]">
            You&apos;ll be taken to Google to authorise read-only access to your Gmail inbox. No emails are sent on your behalf.
          </p>
        )}
      </div>
    </section>
  );
}

function SlackSection({
  config,
  onSaved,
}: {
  config: IntegrationsResponse | null;
  onSaved: (updated: IntegrationsResponse) => void;
}) {
  const [tokenInput, setTokenInput] = useState("");
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!config) return;
    setChannelId(config.slackSummaryChannelId ?? "");
  }, [config]);

  async function handleSave() {
    if (!tokenInput.trim() && !channelId.trim()) return;
    setSaving(true);
    try {
      const payload: Parameters<typeof saveIntegrations>[0] = {};
      if (tokenInput.trim()) payload.slackBotToken = tokenInput.trim();
      if (channelId.trim()) payload.slackSummaryChannelId = channelId.trim();
      await saveIntegrations(payload);
      const updated = await getIntegrations();
      onSaved(updated);
      setTokenInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="app-card p-6">
      <p className="app-eyebrow">Slack</p>
      <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
        Slack context for meeting summaries
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-3)]">
        Connect a Slack workspace to pull relevant messages into AI meeting summaries. Create a bot token
        in your Slack app settings with <code className="rounded bg-[var(--surface-1)] px-1 text-[11px]">channels:history</code> scope.
      </p>

      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Bot token */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
              Slack bot token
            </label>
            {config?.slackBotTokenMasked && !tokenInput && (
              <div className="mb-2 flex items-center gap-2 rounded-[6px] bg-[var(--surface-1)] px-3 py-2">
                <span className="font-mono text-xs text-[var(--text-2)]">{config.slackBotTokenMasked}</span>
              </div>
            )}
            <input
              type="password"
              className="app-input w-full font-mono text-sm"
              placeholder={config?.slackBotTokenMasked ? "Paste new token to replace…" : "xoxb-…"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
          </div>

          {/* Channel ID */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
              Summary channel ID
            </label>
            <input
              type="text"
              className="app-input w-full font-mono text-sm"
              placeholder="C0123456789"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-[var(--text-4)]">
              The channel the bot reads for meeting context. Right-click the channel in Slack → Copy link to find the ID.
            </p>
          </div>
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={saving || (!tokenInput.trim() && !channelId.trim())}
          className="app-button app-button-secondary px-4 py-2 text-sm disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save Slack settings"}
        </button>
      </div>
    </section>
  );
}

function DeveloperTab({
  apiKeyConfigured,
}: {
  apiKeyConfigured: boolean;
}) {
  return (
    <div className="space-y-6">
      <ExternalApiKeySection />
      <ApiSection apiKeyConfigured={apiKeyConfigured} />
    </div>
  );
}

function ExternalApiKeySection() {
  const [integrations, setIntegrations] = useState<IntegrationsResponse | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getIntegrations().then(setIntegrations).catch(() => null);
  }, []);

  async function handleSave() {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await saveIntegrations({ externalApiKey: keyInput.trim() });
      const updated = await getIntegrations();
      setIntegrations(updated);
      setKeyInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="app-card p-6">
      <p className="app-eyebrow">Access control</p>
      <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
        External API Key
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-3)]">
        Used for programmatic access to the Foundry API from external tools and integrations.
        Pass as an{" "}
        <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-2)]">
          Authorization: Bearer &lt;key&gt;
        </code>{" "}
        header. The{" "}
        <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-2)]">
          API_KEY
        </code>{" "}
        environment variable takes precedence if set.
      </p>

      <div className="mt-5 space-y-3">
        {integrations?.externalApiKeyMasked ? (
          <div className="space-y-1.5">
            <FieldLabel>Current key</FieldLabel>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm text-[var(--text-2)]">
                {integrations.externalApiKeyMasked}
              </code>
              {integrations.externalApiKeySource === "env" && (
                <span className="shrink-0 rounded-full bg-[var(--mist)] px-2.5 py-1 text-xs font-medium text-[var(--brand-700)]">
                  from env
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-3 py-2.5 text-sm text-[var(--text-4)]">
            No external API key set yet.
          </p>
        )}

        <div className="space-y-1.5">
          <FieldLabel>
            {integrations?.externalApiKeyMasked ? "Replace key" : "Set key"}
          </FieldLabel>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste your API key…"
              className="app-input flex-1 font-mono text-sm"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || !keyInput.trim()}
            >
              {saved ? (
                <>
                  <CheckIcon className="h-4 w-4" />
                  Saved
                </>
              ) : saving ? (
                "Saving…"
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      </div>
    </section>
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
      : "https://foundry.gitwork.co";

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
            Use these endpoints to connect Foundry Docs, Foundry Code, and external clients to
            Foundry by Gitwork. The web app uses a secure server-set session cookie, while external clients
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

        <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
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
