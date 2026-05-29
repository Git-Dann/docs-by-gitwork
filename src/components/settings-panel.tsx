"use client";

import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpIcon,
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
  previewDemoCleanup, applyDemoCleanup,
  bulkImportCandidates,
  type IntegrationsResponse, type ModelOption, type TeamMember,
  type DemoCleanupPreviewResponse, type DemoCleanupApplyResponse,
  type BulkImportCandidateRow, type BulkImportResult,
} from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import { useUpdateWorkspaceBranding, useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { useUpdateWorkspaceDefaults, useWorkspaceDefaults } from "@/hooks/use-workspace-defaults";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import type { RateBillingPeriod, RateCardPersonRecord } from "@/types/rate-card";
import { MODULE_PERMISSIONS } from "@/types/auth";
import { AgentsPanel } from "@/components/settings/agents-panel";
import { ChecksPanel } from "@/components/settings/checks-panel";
import { SECTION_REGISTRY, allSectionKeys, sectionsByCategory } from "@/lib/sections/registry";
import type { SectionKey } from "@/types/proposal";

type TabId =
  | "general"
  | "branding"
  | "templates"
  | "content"
  | "people"
  | "integrations"
  | "agents"
  | "developer";

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
  { id: "templates", label: "Templates" },
  { id: "content", label: "Content" },
  { id: "people", label: "People & Rates" },
  { id: "integrations", label: "Integrations" },
  { id: "agents", label: "Agents & Checks" },
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
      {activeTab === "templates" && <TemplatesTab />}
      {activeTab === "content" && <ContentTab />}
      {activeTab === "people" && <RateCardTab />}
      {activeTab === "integrations" && <IntegrationsTab />}
      {activeTab === "agents" && <AgentsAndChecksTab />}
      {activeTab === "developer" && isAdmin && <DeveloperTab apiKeyConfigured={apiKeyConfigured} />}
    </div>
  );
}

export function GeneralTab() {
  const defaultsQuery = useWorkspaceDefaults();
  const updateDefaults = useUpdateWorkspaceDefaults();
  const defaults = defaultsQuery.data;

  function patch(patchObject: Partial<{ preparedBy: string; team: string; contactDetails: string }>) {
    updateDefaults.mutate(patchObject);
  }

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <p className="app-eyebrow">Workspace</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Proposal defaults
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Shared defaults pre-filled across proposals and sign-off sections. Saved to the
          workspace so every teammate sees the same values.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <FieldInput
            label="Prepared by"
            value={defaults?.preparedBy ?? ""}
            onChange={(preparedBy) => patch({ preparedBy })}
          />
          <FieldInput
            label="Team / department"
            value={defaults?.team ?? ""}
            onChange={(team) => patch({ team })}
          />
          <FieldInput
            label="Contact details"
            value={defaults?.contactDetails ?? ""}
            onChange={(contactDetails) => patch({ contactDetails })}
          />
        </div>
      </section>
    </div>
  );
}

export function BrandingTab() {
  const brandingQuery = useWorkspaceBranding();
  const updateBranding = useUpdateWorkspaceBranding();
  const workspaceBranding = brandingQuery.data ?? {};

  function patch(field: keyof typeof workspaceBranding, value: string) {
    updateBranding.mutate({ [field]: value });
  }

  return (
    <div className="space-y-6">
      <section className="widget-card overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">01 {"// "}DOCUMENT BRANDING</span>
          <span className="widget-header-right">WORKSPACE-WIDE</span>
        </div>
        <div className="p-6">
          <p className="text-sm leading-6 text-[var(--text-3)]">
            Cover assets used across every document the team produces — proposals, SLAs, SOWs.
            Stored on the workspace so every member sees the same look. Per-document overrides
            still live in the proposal builder.
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <FieldLabel>Gitwork cover logo</FieldLabel>
              <ImagePicker
                value={workspaceBranding.brandLogoUrl ?? ""}
                onChange={(value) => patch("brandLogoUrl", value)}
                previewClassName="h-36 w-full"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Cover top accent</FieldLabel>
              <ImagePicker
                value={workspaceBranding.coverTopAccentUrl ?? ""}
                onChange={(value) => patch("coverTopAccentUrl", value)}
                previewClassName="h-36 w-full"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Cover bottom accent</FieldLabel>
              <ImagePicker
                value={workspaceBranding.coverBottomAccentUrl ?? ""}
                onChange={(value) => patch("coverBottomAccentUrl", value)}
                previewClassName="h-36 w-full"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ContentTab() {
  const brandingQuery = useWorkspaceBranding();
  const updateBranding = useUpdateWorkspaceBranding();
  const defaultsQuery = useWorkspaceDefaults();
  const updateDefaults = useUpdateWorkspaceDefaults();

  const branding = brandingQuery.data;
  const snippets = defaultsQuery.data?.objectiveSnippets ?? [];

  function updateSnippets(next: Array<{ title: string; description: string }>) {
    updateDefaults.mutate({ objectiveSnippets: next });
  }

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
            value={branding?.defaultConfidentialityInternal ?? ""}
            onChange={(value) =>
              updateBranding.mutate({ defaultConfidentialityInternal: value })
            }
          />
          <FieldTextArea
            label="External statement"
            value={branding?.defaultConfidentialityExternal ?? ""}
            onChange={(value) =>
              updateBranding.mutate({ defaultConfidentialityExternal: value })
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
            onClick={() => updateSnippets([...snippets, { title: "", description: "" }])}
          >
            Add snippet
          </Button>
        </div>

        {snippets.length > 0 ? (
          <div className="mt-6 space-y-3">
            {snippets.map((snippet, index) => (
              <article
                key={`${snippet.title}-${index}`}
                className="grid gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto]"
              >
                <FieldInput
                  label="Title"
                  value={snippet.title}
                  onChange={(title) =>
                    updateSnippets(
                      snippets.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, title } : entry,
                      ),
                    )
                  }
                />
                <FieldInput
                  label="Description"
                  value={snippet.description}
                  onChange={(description) =>
                    updateSnippets(
                      snippets.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, description } : entry,
                      ),
                    )
                  }
                />
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      updateSnippets(snippets.filter((_, entryIndex) => entryIndex !== index))
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

export function RateCardTab() {
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

// ── Agents & Checks Tab ──────────────────────────────────────────────────────

export function AgentsAndChecksTab() {
  const [subTab, setSubTab] = useState<"agents" | "checks">("agents");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-1)]">Agents & Checks</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Customise the AI agents that power Pulse and Study, and manage which automated checks run during Pulse scans.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--border-2)] bg-[var(--bg-2)] p-1 w-fit">
        <button
          type="button"
          onClick={() => setSubTab("agents")}
          className={cn(
            "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
            subTab === "agents"
              ? "bg-[var(--bg-1)] text-[var(--text-1)] shadow-sm"
              : "text-[var(--text-3)] hover:text-[var(--text-2)]",
          )}
        >
          Agents
        </button>
        <button
          type="button"
          onClick={() => setSubTab("checks")}
          className={cn(
            "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
            subTab === "checks"
              ? "bg-[var(--bg-1)] text-[var(--text-1)] shadow-sm"
              : "text-[var(--text-3)] hover:text-[var(--text-2)]",
          )}
        >
          Pulse Checks
        </button>
      </div>

      {subTab === "agents" && <AgentsPanel />}
      {subTab === "checks" && <ChecksPanel />}
    </div>
  );
}

// ── Integrations Tab ─────────────────────────────────────────────────────────

export function IntegrationsTab() {
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

      {/* ── Email outbound ────────────────────────────────────────── */}
      <EmailOutboundSection config={config} onSaved={setConfig} />

      {/* ── Slack webhook notifications on doc events (P5.20) ──────── */}
      <SlackDocNotificationsSection />

      {/* ── Branded subdomain for public share URLs (P5.19) ────────── */}
      <CustomHostnameSection />
    </div>
  );
}

export function TeamTab({ currentUserId }: { currentUserId: string }) {
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

const SLACK_ROUTE_EVENTS: { id: string; label: string; module: string }[] = [
  { id: "pulse.scan_failed", label: "Pulse scan failed", module: "Pulse" },
  { id: "pulse.monitor_drift", label: "Pulse monitor drift", module: "Pulse" },
  { id: "study.report_ready", label: "Study report ready", module: "Study" },
  { id: "care.ticket_created", label: "Care ticket created", module: "Care" },
  { id: "care.ticket_escalated", label: "Care ticket escalated", module: "Care" },
  { id: "docs.viewed_by_client", label: "Doc viewed by client", module: "Docs" },
  { id: "docs.signed", label: "Doc signed", module: "Docs" },
];

function SlackSection({
  config,
  onSaved,
}: {
  config: IntegrationsResponse | null;
  onSaved: (updated: IntegrationsResponse) => void;
}) {
  const [tokenInput, setTokenInput] = useState("");
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [newChannelId, setNewChannelId] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    const saved = (config.slackChannels ?? []) as Array<{ id: string; name: string }>;
    // If no multi-channel data yet but legacy single channel exists, seed from that
    if (saved.length === 0 && config.slackSummaryChannelId) {
      setChannels([{ id: config.slackSummaryChannelId, name: "General" }]);
    } else {
      setChannels(saved);
    }
    setRoutes(config.channelRoutes ?? {});
  }, [config]);

  function addChannel() {
    const id = newChannelId.trim();
    const name = newChannelName.trim() || id;
    if (!id) return;
    if (channels.some((c) => c.id === id)) return; // already added
    setChannels((prev) => [...prev, { id, name }]);
    setNewChannelId("");
    setNewChannelName("");
  }

  function removeChannel(id: string) {
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }

  function updateChannelName(id: string, name: string) {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      // Auto-flush any channel typed in the inputs but not yet added via +
      let finalChannels = channels;
      const pendingId = newChannelId.trim();
      if (pendingId && !channels.some((c) => c.id === pendingId)) {
        const pendingName = newChannelName.trim() || pendingId;
        finalChannels = [...channels, { id: pendingId, name: pendingName }];
        setChannels(finalChannels);
        setNewChannelId("");
        setNewChannelName("");
      }

      const payload: Parameters<typeof saveIntegrations>[0] = {};
      if (tokenInput.trim()) payload.slackBotToken = tokenInput.trim();
      payload.slackChannels = finalChannels;
      payload.channelRoutes = routes;

      await saveIntegrations(payload);
      const updated = await getIntegrations();
      onSaved(updated);
      setTokenInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed — please try again.");
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
        Connect a Slack workspace to pull relevant messages into AI meeting summaries. Add the channels
        you want available — you can pick which ones to search per meeting. Requires a bot token with{" "}
        <code className="rounded bg-[var(--surface-1)] px-1 text-[11px]">channels:history</code> scope.
      </p>

      <div className="mt-5 space-y-5">
        {/* Bot token */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
            Slack bot token
          </label>
          {config?.slackBotTokenMasked && !tokenInput && (
            <div className="mb-2 flex items-center gap-2 rounded-[6px] bg-[var(--surface-1)] px-3 py-2">
              <span className="font-mono text-xs text-[var(--text-2)]">{config.slackBotTokenMasked}</span>
              <span className="ml-auto text-[10px] text-emerald-600">Connected</span>
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

        {/* Channel list */}
        <div>
          <label className="mb-2 block text-xs font-medium text-[var(--text-2)]">
            Channels
          </label>
          {channels.length > 0 && (
            <div className="mb-3 space-y-2">
              {channels.map((ch) => (
                <div key={ch.id} className="flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
                  <input
                    type="text"
                    className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[var(--text-1)] outline-none"
                    value={ch.name}
                    onChange={(e) => updateChannelName(ch.id, e.target.value)}
                    placeholder="Channel name"
                  />
                  <span className="font-mono text-[10px] text-[var(--text-4)]">{ch.id}</span>
                  <button
                    onClick={() => removeChannel(ch.id)}
                    className="ml-1 rounded p-0.5 text-[var(--text-4)] hover:text-red-500"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add channel row */}
          <div className="flex gap-2">
            <input
              type="text"
              className="app-input w-40 font-mono text-sm"
              placeholder="C0123456789"
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addChannel()}
            />
            <input
              type="text"
              className="app-input flex-1 text-sm"
              placeholder="Label (e.g. #general)"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addChannel()}
            />
            <button
              onClick={addChannel}
              disabled={!newChannelId.trim()}
              className="app-button app-button-secondary px-3 py-2 text-sm disabled:opacity-40"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-4)]">
            Right-click a channel in Slack → Copy link — the ID is the last segment (e.g. <span className="font-mono">C0123456789</span>).
          </p>
        </div>

        {saveError && (
          <p className="text-xs text-red-500">{saveError}</p>
        )}

        {/* Per-event routing — assign a channel to each Foundry event. Empty = no Slack post. */}
        {channels.length > 0 ? (
          <div>
            <label className="mb-2 block text-xs font-medium text-[var(--text-2)]">
              Per-event routing
            </label>
            <p className="mb-1.5 text-[11px] text-[var(--text-4)]">
              Route specific Foundry events to specific channels. Events left as &ldquo;None&rdquo;
              won&rsquo;t post to Slack — they&rsquo;ll still appear in per-user notification
              preferences and email/push if configured.
            </p>
            <p className="mb-3 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11px] text-[var(--text-3)]">
              <strong>Saved &mdash; not yet firing.</strong> Per-event Slack delivery ships
              alongside the notification dispatcher in the next release.
            </p>
            <div className="space-y-1.5">
              {SLACK_ROUTE_EVENTS.map((event) => (
                <div
                  key={event.id}
                  className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,180px)] items-center gap-3 rounded-[6px] border border-[var(--border-3)] bg-[var(--surface-1)] px-3 py-2"
                >
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                    {event.module}
                  </span>
                  <span className="text-xs text-[var(--text-2)]">{event.label}</span>
                  <select
                    value={routes[event.id] ?? ""}
                    onChange={(e) =>
                      setRoutes((current) => {
                        const next = { ...current };
                        if (e.target.value) next[event.id] = e.target.value;
                        else delete next[event.id];
                        return next;
                      })
                    }
                    className="app-select text-xs"
                  >
                    <option value="">None</option>
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="app-button app-button-secondary px-4 py-2 text-sm disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save Slack settings"}
        </button>
      </div>
    </section>
  );
}

// Outbound email — used for proposal sends, Care replies, notifications. Two providers:
// Resend (API-key-based, recommended) and SMTP (any provider that exposes SMTP).
function EmailOutboundSection({
  config,
  onSaved,
}: {
  config: IntegrationsResponse | null;
  onSaved: (updated: IntegrationsResponse) => void;
}) {
  const [provider, setProvider] = useState<"RESEND" | "SMTP" | "NONE">("NONE");
  const [apiKey, setApiKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState<string>("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!config) return;
    setProvider(config.emailProvider ?? "NONE");
    setFromAddress(config.emailFromAddress ?? "");
    setFromName(config.emailFromName ?? "");
    setReplyTo(config.emailReplyTo ?? "");
    setSmtpHost(config.emailSmtpHost ?? "");
    setSmtpPort(config.emailSmtpPort ? String(config.emailSmtpPort) : "587");
    setSmtpUser(config.emailSmtpUser ?? "");
  }, [config]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Parameters<typeof saveIntegrations>[0] = {
        emailProvider: provider === "NONE" ? null : provider,
      };
      if (apiKey.trim()) payload.emailApiKey = apiKey.trim();
      if (fromAddress.trim()) payload.emailFromAddress = fromAddress.trim();
      if (fromName.trim()) payload.emailFromName = fromName.trim();
      if (replyTo.trim()) payload.emailReplyTo = replyTo.trim();
      if (provider === "SMTP") {
        if (smtpHost.trim()) payload.emailSmtpHost = smtpHost.trim();
        const port = Number.parseInt(smtpPort, 10);
        if (Number.isFinite(port) && port > 0) payload.emailSmtpPort = port;
        if (smtpUser.trim()) payload.emailSmtpUser = smtpUser.trim();
        if (smtpPassword.trim()) payload.emailSmtpPassword = smtpPassword.trim();
      }
      await saveIntegrations(payload);
      const updated = await getIntegrations();
      onSaved(updated);
      setApiKey("");
      setSmtpPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="app-card p-6">
      <p className="app-eyebrow">Email</p>
      <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
        Outbound email
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-3)]">
        Used for proposal sends, Care replies, and notification emails. Pick a provider, set the
        From identity, and Foundry will route outgoing mail through it.
      </p>
      <p className="mt-3 max-w-2xl rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-3)]">
        <strong>Saved &mdash; not yet active.</strong> Email delivery still flows through the
        existing Care Gmail connector. Switching everything to this provider ships in the next
        release.
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
            Provider
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as "RESEND" | "SMTP" | "NONE")}
            className="app-select"
          >
            <option value="NONE">Not configured</option>
            <option value="RESEND">Resend (recommended)</option>
            <option value="SMTP">Custom SMTP</option>
          </select>
        </div>

        {provider !== "NONE" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--text-2)]">From address</span>
              <input
                type="email"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder="hello@gitwork.co.uk"
                className="app-input w-full"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--text-2)]">From name</span>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Gitwork"
                className="app-input w-full"
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium text-[var(--text-2)]">Reply-to (optional)</span>
              <input
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="Defaults to From address"
                className="app-input w-full"
              />
            </label>
          </div>
        ) : null}

        {provider === "RESEND" ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
              Resend API key
            </label>
            {config?.emailApiKeyMasked && !apiKey ? (
              <div className="mb-2 flex items-center gap-2 rounded-[6px] bg-[var(--surface-1)] px-3 py-2">
                <span className="font-mono text-xs text-[var(--text-2)]">
                  {config.emailApiKeyMasked}
                </span>
                <span className="ml-auto text-[10px] text-emerald-600">Connected</span>
              </div>
            ) : null}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.emailApiKeyMasked ? "Paste new key to replace…" : "re_…"}
              className="app-input w-full font-mono text-sm"
            />
          </div>
        ) : null}

        {provider === "SMTP" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--text-2)]">SMTP host</span>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.eu.mailgun.org"
                className="app-input w-full"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--text-2)]">Port</span>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
                className="app-input w-full"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--text-2)]">SMTP username</span>
              <input
                type="text"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                className="app-input w-full"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--text-2)]">SMTP password</span>
              <input
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={config?.emailSmtpPasswordSet ? "Paste new to replace…" : ""}
                className="app-input w-full font-mono text-sm"
              />
            </label>
          </div>
        ) : null}

        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="app-button app-button-secondary px-4 py-2 text-sm disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save email settings"}
        </button>
      </div>
    </section>
  );
}

export function DeveloperTab({
  apiKeyConfigured,
}: {
  apiKeyConfigured: boolean;
}) {
  return (
    <div className="space-y-6">
      <ExternalApiKeySection />
      <DemoDataCleanupSection />
      <CandidateBulkImportSection />
      <ApiSection apiKeyConfigured={apiKeyConfigured} />
    </div>
  );
}

/**
 * Bulk-import devs from CSV/JSON into the CodeClear roster. Two modes:
 *   - Paste JSON (advanced)
 *   - Upload CSV (helper) — first row is the header
 * The endpoint dedupes by GitHub handle and reports per-row outcomes.
 */
function CandidateBulkImportSection() {
  const [origin, setOrigin] = useState<"INTERNAL" | "EXTERNAL">("EXTERNAL");
  const [rows, setRows] = useState<BulkImportCandidateRow[]>([]);
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  // Lightweight CSV parser — first row is the header. Supports double-quoted
  // values with embedded commas. Sufficient for typical sourcing exports;
  // doesn't try to be a full RFC 4180 parser.
  function parseCsv(text: string): BulkImportCandidateRow[] {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return [];
    const splitRow = (line: string): string[] => {
      const out: string[] = [];
      let current = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === "," && !quoted) {
          out.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      out.push(current);
      return out.map((v) => v.trim());
    };

    const headers = splitRow(lines[0]).map((h) => h.toLowerCase());
    const parsed: BulkImportCandidateRow[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cells = splitRow(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        const value = cells[index] ?? "";
        if (value !== "") row[header] = value;
      });
      if (!row.name || !row.githubhandle || !row.primarystack) continue;
      parsed.push({
        name: row.name,
        githubHandle: row.githubhandle,
        primaryStack: row.primarystack,
        techStacks: row.techstacks ? row.techstacks.split("|").map((s) => s.trim()) : undefined,
        email: row.email || undefined,
        linkedinUrl: row.linkedinurl || undefined,
        cvUrl: row.cvurl || undefined,
        portfolioUrl: row.portfoliourl || undefined,
        yearsExperience: row.yearsexperience ? Number(row.yearsexperience) : undefined,
        hourlyRate: row.hourlyrate ? Number(row.hourlyrate) : undefined,
        currency: row.currency || undefined,
        timezone: row.timezone || undefined,
        location: row.location || undefined,
        bio: row.bio || undefined,
      });
    }
    return parsed;
  }

  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setParseError("CSV is empty or missing required columns (name, githubHandle, primaryStack).");
        return;
      }
      setRows(parsed);
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to read file");
    }
  }

  function handleJsonChange(text: string) {
    setJsonText(text);
    setParseError(null);
    if (!text.trim()) {
      setRows([]);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setParseError("Expected a JSON array of candidate rows.");
        return;
      }
      setRows(parsed as BulkImportCandidateRow[]);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  async function handleSubmit() {
    if (rows.length === 0) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await bulkImportCandidates({ candidates: rows, origin });
      setResult(res);
      // Clear input on full success so the user knows it landed
      if (res.errors.length === 0 && res.skipped.length === 0) {
        setRows([]);
        setJsonText("");
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  function downloadTemplate() {
    const headers = [
      "name",
      "githubHandle",
      "primaryStack",
      "techStacks",
      "email",
      "linkedinUrl",
      "cvUrl",
      "portfolioUrl",
      "yearsExperience",
      "hourlyRate",
      "currency",
      "timezone",
      "location",
      "bio",
    ].join(",");
    const example = `"Jane Doe",janedoe,TypeScript,React|Next.js|Node.js,jane@example.com,https://linkedin.com/in/janedoe,,,5,75,USD,Europe/London,London,Senior full-stack engineer.`;
    const csv = `${headers}\n${example}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codeclear-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="app-card p-6">
      <p className="app-eyebrow">Catalogue</p>
      <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
        Bulk import candidates
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-3)]">
        Upload a CSV or paste a JSON array to add up to 500 devs in one go.
        Dedupes by GitHub handle within this workspace. New rows are marked{" "}
        <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-xs">EXTERNAL</code>{" "}
        by default — flip to{" "}
        <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-xs">INTERNAL</code>{" "}
        if you&apos;re bulk-adding teammates instead of catalogue devs.
      </p>

      <div className="mt-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={downloadTemplate}>
            Download CSV template
          </Button>
          <label className="inline-flex items-center">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
                event.target.value = "";
              }}
            />
            <span className="app-button app-button-secondary cursor-pointer px-3 py-1.5 text-[13px]">
              Upload CSV…
            </span>
          </label>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="font-medium text-[var(--text-3)]">Origin</span>
            {(["INTERNAL", "EXTERNAL"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setOrigin(value)}
                className={cn(
                  "rounded-[6px] border px-2.5 py-1 font-semibold transition",
                  origin === value
                    ? "border-[var(--brand-600)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
                    : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:border-[var(--border-1)]",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={jsonText}
          onChange={(event) => handleJsonChange(event.target.value)}
          rows={8}
          placeholder='[{"name":"Jane Doe","githubHandle":"janedoe","primaryStack":"TypeScript"}]'
          className="app-input min-h-[140px] resize-y font-mono text-xs"
          spellCheck={false}
        />
        {parseError ? (
          <p className="text-xs text-rose-600">{parseError}</p>
        ) : rows.length > 0 ? (
          <p className="text-xs text-[var(--text-4)]">
            {rows.length} row{rows.length === 1 ? "" : "s"} parsed. Ready to import.
          </p>
        ) : null}

        {submitError ? (
          <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {submitError}
          </div>
        ) : null}

        {result ? (
          <div className="space-y-2">
            <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <p className="font-semibold">
                Imported {result.created.length} / {result.total}
              </p>
              {(result.skipped.length > 0 || result.errors.length > 0) && (
                <p className="mt-1 text-xs">
                  {result.skipped.length} skipped, {result.errors.length} errored.
                </p>
              )}
            </div>
            {result.skipped.length > 0 ? (
              <details className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3 text-xs">
                <summary className="cursor-pointer font-semibold text-[var(--text-2)]">
                  Skipped ({result.skipped.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {result.skipped.map((row) => (
                    <li key={row.githubHandle} className="font-mono text-[var(--text-4)]">
                      @{row.githubHandle} — {row.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {result.errors.length > 0 ? (
              <details className="rounded-[10px] border border-rose-200 bg-white px-4 py-3 text-xs">
                <summary className="cursor-pointer font-semibold text-rose-700">
                  Errors ({result.errors.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {result.errors.map((row) => (
                    <li key={row.githubHandle} className="font-mono text-rose-600">
                      @{row.githubHandle} — {row.error}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={rows.length === 0 || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Importing…" : `Import ${rows.length || ""} dev${rows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </section>
  );
}

function DemoDataCleanupSection() {
  const [preview, setPreview] = useState<DemoCleanupPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<DemoCleanupApplyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    setError(null);
    setApplied(null);
    setPreviewLoading(true);
    try {
      const result = await previewDemoCleanup();
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApply() {
    if (!preview || preview.total === 0) return;
    if (
      !window.confirm(
        `Delete ${preview.total} row${preview.total === 1 ? "" : "s"}? This can't be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    setApplying(true);
    try {
      const result = await applyDemoCleanup();
      setApplied(result);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setApplying(false);
    }
  }

  const totalToDelete = preview?.total ?? 0;

  return (
    <section className="app-card p-6">
      <p className="app-eyebrow">Maintenance</p>
      <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
        Demo data cleanup
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-3)]">
        Removes the original demo candidates (Sindre Sorhus, Dan Abramov, Addy Osmani, Evan You,
        TJ Holowaychuk, Linus Torvalds) and the legacy rate-card seed entries that aren&apos;t in
        the current Gitwork roster. It only touches those specific known records — anything
        you&apos;ve added yourself stays put. Safe to re-run; nothing happens the second time.
      </p>

      {error ? (
        <div className="mt-4 rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {applied ? (
        <div className="mt-4 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p className="font-semibold">Cleanup complete</p>
          <p className="mt-1">
            Deleted {applied.deletedCandidates} candidate
            {applied.deletedCandidates === 1 ? "" : "s"} and {applied.deletedRatePeople} rate-card{" "}
            {applied.deletedRatePeople === 1 ? "person" : "people"}.
          </p>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-5 space-y-4">
          {preview.total === 0 ? (
            <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-3)]">
              Nothing to clean up — the demo records are already gone.
            </div>
          ) : (
            <>
              {preview.candidates.length > 0 ? (
                <div>
                  <p className="text-sm font-semibold text-[var(--text-2)]">
                    Candidates ({preview.candidates.length})
                  </p>
                  <ul className="mt-2 divide-y divide-[var(--border-3)] rounded-[10px] border border-[var(--border-2)] bg-white">
                    {preview.candidates.map((candidate) => (
                      <li key={candidate.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-medium text-[var(--text-1)]">{candidate.name}</span>
                        <span className="font-mono text-xs text-[var(--text-4)]">
                          @{candidate.githubHandle}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.ratePeople.length > 0 ? (
                <div>
                  <p className="text-sm font-semibold text-[var(--text-2)]">
                    Rate-card people ({preview.ratePeople.length})
                  </p>
                  <ul className="mt-2 divide-y divide-[var(--border-3)] rounded-[10px] border border-[var(--border-2)] bg-white">
                    {preview.ratePeople.map((person) => (
                      <li key={person.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-medium text-[var(--text-1)]">{person.name}</span>
                        <span className="font-mono text-xs text-[var(--text-4)]">
                          {person.seedIdentifier ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handlePreview}
          disabled={previewLoading}
        >
          {previewLoading ? "Loading…" : preview ? "Refresh preview" : "Preview cleanup"}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleApply}
          disabled={!preview || totalToDelete === 0 || applying}
        >
          {applying ? "Deleting…" : `Apply cleanup${totalToDelete > 0 ? ` (${totalToDelete})` : ""}`}
        </Button>
      </div>
    </section>
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

// ── Templates tab (Sprint 4) ──────────────────────────────────────────────────────────

interface TemplateRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  documentType: "PROPOSAL" | "SLA" | "SOW" | "MSA" | "NDA" | "CO" | "OTHER";
  isDefault: boolean;
  sections: unknown;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
}

const DOC_TYPE_LABEL: Record<TemplateRecord["documentType"], string> = {
  PROPOSAL: "Proposal",
  SLA: "Service Level Agreement",
  SOW: "Statement of Work",
  MSA: "Master Service Agreement",
  NDA: "Non-Disclosure Agreement",
  CO: "Change Order",
  OTHER: "Document",
};

/** One template section row used by the inline editor. Mirrors the API shape. */
interface TemplateSectionDraft {
  key: string;
  title?: string;
  data?: unknown;
}

export function TemplatesTab() {
  const [templates, setTemplates] = useState<TemplateRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function reload() {
    setError(null);
    try {
      const res = await apiFetch<{ templates: TemplateRecord[] }>("/api/templates");
      setTemplates(res.templates);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleSetDefault(template: TemplateRecord) {
    if (template.isDefault) return;
    setBusyId(template.id);
    try {
      await apiFetch(`/api/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(template: TemplateRecord) {
    setBusyId(template.id);
    try {
      await apiFetch(`/api/templates/${template.id}/duplicate`, { method: "POST" });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveEdit(
    template: TemplateRecord,
    patch: { name: string; description: string; sections: TemplateSectionDraft[] },
  ) {
    setBusyId(template.id);
    try {
      await apiFetch(`/api/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: patch.name,
          description: patch.description,
          sections: patch.sections,
        }),
      });
      setEditingId(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(template: TemplateRecord) {
    if (!confirm(`Delete the "${template.name}" template? This cannot be undone.`)) return;
    setBusyId(template.id);
    try {
      await apiFetch(`/api/templates/${template.id}`, { method: "DELETE" });
      setEditingId(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (templates === null) {
    return (
      <p className="text-sm text-[var(--text-3)]">Loading templates…</p>
    );
  }

  // Group templates by documentType for the list — easier to scan when 6+ types are in play.
  const grouped = templates.reduce<Record<string, TemplateRecord[]>>((acc, t) => {
    (acc[t.documentType] ??= []).push(t);
    return acc;
  }, {});

  const orderedTypes: TemplateRecord["documentType"][] = [
    "PROPOSAL",
    "SLA",
    "SOW",
    "MSA",
    "NDA",
    "CO",
    "OTHER",
  ];

  return (
    <div className="space-y-6">
      <section className="widget-card overflow-hidden">
        <div className="widget-header">
          <span className="widget-header-label">01 {"// "}DOCUMENT TEMPLATES</span>
          <span className="widget-header-right">{templates.length} TOTAL</span>
        </div>
        <div className="space-y-5 p-6">
          <p className="text-sm leading-6 text-[var(--text-3)]">
            Every new Document is spun up from a template. The seed templates here are bundled with
            Foundry — duplicate one to make a workspace-owned variant you can tweak per client.
            Setting a template as <strong>Default</strong> for its type means every new document of
            that type uses it as the starting point.
          </p>

          {error ? (
            <p className="text-sm font-medium text-[var(--danger-500)]">{error}</p>
          ) : null}

          {orderedTypes.map((type) => {
            const rows = grouped[type] ?? [];
            if (!rows.length) return null;
            return (
              <div key={type} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2 pt-1">
                  <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                    {DOC_TYPE_LABEL[type]} · {type}
                  </h3>
                  <span className="text-xs text-[var(--text-4)]">{rows.length} template{rows.length === 1 ? "" : "s"}</span>
                </div>

                <ul className="space-y-2">
                  {rows.map((template) => {
                    const isOpen = expanded === template.id;
                    const sections = Array.isArray(template.sections)
                      ? (template.sections as Array<{ title?: string; key?: string }>)
                      : [];

                    return (
                      <li
                        key={template.id}
                        className="rounded-[10px] border border-[var(--border-2)] bg-white"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-[var(--text-1)]">
                                {template.name}
                              </p>
                              {template.isDefault ? (
                                <span className="rounded-[4px] bg-[var(--brand-200)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                                  DEFAULT
                                </span>
                              ) : null}
                              {template.workspaceId === null ? (
                                <span className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                                  FOUNDRY
                                </span>
                              ) : (
                                <span className="rounded-[4px] border border-[var(--brand-600)]/40 bg-[var(--brand-200)]/40 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                                  WORKSPACE
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--text-4)]">
                              {sections.length} sections · {template.documentCount} document
                              {template.documentCount === 1 ? "" : "s"} created · slug{" "}
                              <code className="font-mono">{template.slug}</code>
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {!template.isDefault ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handleSetDefault(template)}
                                loading={busyId === template.id}
                              >
                                Set default
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleDuplicate(template)}
                              loading={busyId === template.id}
                            >
                              Duplicate
                            </Button>
                            {template.workspaceId !== null ? (
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={() =>
                                  setEditingId(editingId === template.id ? null : template.id)
                                }
                                leadingIcon={<PencilIcon className="h-3.5 w-3.5" />}
                              >
                                {editingId === template.id ? "Close" : "Edit"}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="tertiary"
                                size="sm"
                                onClick={() => setExpanded(isOpen ? null : template.id)}
                              >
                                {isOpen ? "Hide sections" : "View sections"}
                              </Button>
                            )}
                          </div>
                        </div>
                        {editingId === template.id && template.workspaceId !== null ? (
                          <TemplateEditor
                            template={template}
                            sections={sections as TemplateSectionDraft[]}
                            busy={busyId === template.id}
                            onCancel={() => setEditingId(null)}
                            onSave={(patch) => void handleSaveEdit(template, patch)}
                            onDelete={() => void handleDelete(template)}
                          />
                        ) : isOpen ? (
                          <div className="border-t border-[var(--border-3)] bg-[var(--surface-1)] px-4 py-3">
                            <ol className="space-y-1">
                              {sections.map((section, index) => (
                                <li key={index} className="flex items-baseline justify-between gap-3 text-xs">
                                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                                    {String(index + 1).padStart(2, "0")}
                                  </span>
                                  <span className="flex-1 text-[var(--text-2)]">{section.title ?? section.key}</span>
                                  <code className="font-mono text-[10px] text-[var(--text-4)]">{section.key ?? "—"}</code>
                                </li>
                              ))}
                            </ol>
                            <p className="mt-3 text-[11px] text-[var(--text-4)]">
                              This is a Foundry stock template &mdash; duplicate it to make a workspace-owned copy you can edit.
                            </p>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/**
 * Inline editor for a workspace-owned template. Surfaces:
 *   - Rename + description
 *   - Section list with reorder (up/down) and remove
 *   - "Add section" picker that browses SECTION_REGISTRY grouped by category
 *   - Delete template (workspace-owned only)
 *
 * Saves the entire `sections` array via PATCH /api/templates/[id]. We don't validate block
 * `data` shape here — the API accepts arbitrary Json passthrough and the section's defaultData
 * is always shape-correct because it comes from the registry.
 */
function TemplateEditor({
  template,
  sections,
  busy,
  onCancel,
  onSave,
  onDelete,
}: {
  template: TemplateRecord;
  sections: TemplateSectionDraft[];
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: { name: string; description: string; sections: TemplateSectionDraft[] }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [draft, setDraft] = useState<TemplateSectionDraft[]>(() =>
    sections.map((s) => ({ key: s.key, title: s.title, data: s.data })),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  function moveUp(index: number) {
    if (index === 0) return;
    setDraft((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }
  function moveDown(index: number) {
    setDraft((prev) => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
      return next;
    });
  }
  function removeAt(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }
  function updateTitleAt(index: number, title: string) {
    setDraft((prev) => prev.map((s, i) => (i === index ? { ...s, title } : s)));
  }
  function addSection(key: SectionKey) {
    const reg = SECTION_REGISTRY[key];
    if (!reg) return;
    setDraft((prev) => [
      ...prev,
      { key, title: reg.defaultTitle, data: reg.defaultData },
    ]);
    setPickerOpen(false);
  }

  const canSave = name.trim().length > 0 && draft.length > 0;

  return (
    <div className="border-t border-[var(--border-3)] bg-[var(--surface-1)] px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Template name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="app-input"
            maxLength={120}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="app-input"
            maxLength={500}
            placeholder="When to use this template…"
          />
        </label>
      </div>

      <div className="mt-4">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
          Sections ({draft.length})
        </p>
        <ul className="mt-2 space-y-1">
          {draft.map((section, i) => {
            const reg = SECTION_REGISTRY[section.key as SectionKey];
            const Icon = reg?.icon;
            return (
              <li
                key={`${section.key}-${i}`}
                className="flex items-center gap-2 rounded-[6px] border border-[var(--border-3)] bg-white px-3 py-2"
              >
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)] w-6 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {Icon ? <Icon className="h-4 w-4 text-[var(--text-3)] shrink-0" /> : null}
                <input
                  value={section.title ?? ""}
                  onChange={(e) => updateTitleAt(i, e.target.value)}
                  placeholder={reg?.defaultTitle ?? section.key}
                  className="flex-1 border-0 bg-transparent p-0 text-sm font-medium text-[var(--text-1)] focus:outline-none focus:ring-0"
                  maxLength={200}
                />
                <code className="font-mono text-[10px] text-[var(--text-4)] hidden sm:inline">
                  {section.key}
                </code>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="rounded p-1 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-30"
                  >
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === draft.length - 1}
                    aria-label="Move down"
                    className="rounded p-1 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-30"
                  >
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label="Remove section"
                    className="rounded p-1 text-rose-600 transition hover:bg-rose-50"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {pickerOpen ? (
          <SectionPicker onPick={addSection} onClose={() => setPickerOpen(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
          >
            <PlusIcon className="h-4 w-4" /> Add a section
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="utility"
          size="sm"
          onClick={onDelete}
          loading={busy}
          leadingIcon={<TrashIcon className="h-3.5 w-3.5" />}
          className="text-rose-600 hover:text-rose-700"
        >
          Delete template
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onSave({ name: name.trim(), description: description.trim(), sections: draft })}
            disabled={!canSave}
            loading={busy}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact "add a block" picker. Lists every section in SECTION_REGISTRY grouped by category.
 * Lives inline in the template editor — when the user picks a block, it gets appended to the
 * template's section list with the registry's defaultData / defaultTitle.
 */
function SectionPicker({
  onPick,
  onClose,
}: {
  onPick: (key: SectionKey) => void;
  onClose: () => void;
}) {
  const grouped = sectionsByCategory(allSectionKeys());

  return (
    <div className="mt-3 rounded-[8px] border border-[var(--border-2)] bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
          Pick a block
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close picker"
          className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
        {grouped.map((group) => (
          <div key={group.category}>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
              {group.category}
            </p>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {group.keys.map((key) => {
                const reg = SECTION_REGISTRY[key];
                const Icon = reg.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onPick(key)}
                    className="flex items-start gap-2 rounded-[6px] border border-transparent px-2 py-1.5 text-left transition hover:border-[var(--border-2)] hover:bg-[var(--surface-1)]"
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 text-[var(--text-3)] shrink-0" />
                    <span className="flex flex-col gap-0">
                      <span className="text-sm font-medium text-[var(--text-1)]">
                        {reg.displayName}
                      </span>
                      <span className="text-[11px] leading-snug text-[var(--text-3)] line-clamp-1">
                        {reg.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Slack webhook subscriptions for doc events (P5.20).
 *
 * One workspace can have any number of webhook subscriptions, each pointed at a Slack incoming
 * webhook URL with a per-event-kind filter. Useful for routing different event classes to
 * different channels (e.g. #signing-pings for DOC_SIGNED, #comments for COMMENT_ADDED).
 *
 * Webhook URLs are validated client-side (must start with https://hooks.slack.com/) and
 * masked in the list so they don't leak in screenshots.
 */
interface SlackWebhookSubscriptionRecord {
  id: string;
  label: string;
  webhookUrlPreview: string;
  eventKinds: string[];
  enabled: boolean;
  createdAt: string;
}

const NOTIFY_EVENTS = [
  { id: "DOC_SHARED",    label: "Share link minted" },
  { id: "DOC_VIEWED",    label: "Public visitor viewed" },
  { id: "DOC_SENT",      label: "Sent for signature" },
  { id: "DOC_SIGNED",    label: "Signer signed" },
  { id: "DOC_COMPLETED", label: "Fully signed" },
  { id: "DOC_DECLINED",  label: "Signing declined" },
  { id: "COMMENT_ADDED", label: "New comment" },
] as const;

function SlackDocNotificationsSection() {
  const [subs, setSubs] = useState<SlackWebhookSubscriptionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["DOC_SIGNED", "DOC_COMPLETED"]);

  async function reload() {
    setError(null);
    try {
      const res = await apiFetch<{ subscriptions: SlackWebhookSubscriptionRecord[] }>(
        "/api/settings/slack-webhooks",
      );
      setSubs(res.subscriptions);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleCreate() {
    if (newLabel.trim().length === 0 || newUrl.trim().length === 0 || newEvents.length === 0) {
      setError("Label, webhook URL, and at least one event are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await apiFetch("/api/settings/slack-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim(),
          webhookUrl: newUrl.trim(),
          eventKinds: newEvents,
        }),
      });
      setNewLabel("");
      setNewUrl("");
      setNewEvents(["DOC_SIGNED", "DOC_COMPLETED"]);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(sub: SlackWebhookSubscriptionRecord) {
    setBusyId(sub.id);
    try {
      await apiFetch(`/api/settings/slack-webhooks/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !sub.enabled }),
      });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(sub: SlackWebhookSubscriptionRecord) {
    if (!confirm(`Delete the "${sub.label}" webhook?`)) return;
    setBusyId(sub.id);
    try {
      await apiFetch(`/api/settings/slack-webhooks/${sub.id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function toggleNewEvent(id: string) {
    setNewEvents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">DOC NOTIFICATIONS · SLACK</span>
        <span className="widget-header-right">{subs?.length ?? 0} CONFIGURED</span>
      </div>

      <div className="space-y-5 p-6">
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Post a message to a Slack channel whenever a doc event happens &mdash; share link minted,
          public viewer opens it, signers sign or decline, comments come in. Create an{" "}
          <a
            href="https://api.slack.com/messaging/webhooks"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--brand-700)] hover:underline"
          >
            incoming webhook
          </a>{" "}
          in Slack, paste the URL here, and pick which events should trigger it.
        </p>

        {error ? (
          <p className="text-sm font-medium text-[var(--danger-500)]">{error}</p>
        ) : null}

        {/* Existing subscriptions */}
        {subs === null ? (
          <p className="text-sm text-[var(--text-3)]">Loading…</p>
        ) : subs.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">
            No webhooks yet. Add one below to start receiving Slack notifications.
          </p>
        ) : (
          <ul className="space-y-2">
            {subs.map((sub) => (
              <li
                key={sub.id}
                className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text-1)]">{sub.label}</p>
                      {!sub.enabled ? (
                        <span className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                          DISABLED
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--text-4)]">
                      {sub.webhookUrlPreview}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleToggle(sub)}
                      loading={busyId === sub.id}
                    >
                      {sub.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="utility"
                      size="sm"
                      onClick={() => handleDelete(sub)}
                      loading={busyId === sub.id}
                      className="text-rose-600 hover:text-rose-700"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {NOTIFY_EVENTS.filter((e) => sub.eventKinds.includes(e.id)).map((e) => (
                    <span
                      key={e.id}
                      className="rounded-[4px] bg-[var(--brand-200)]/40 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--brand-700)]"
                    >
                      {e.label}
                    </span>
                  ))}
                  {sub.eventKinds.length === 0 ? (
                    <span className="text-[11px] italic text-[var(--text-4)]">
                      No events selected — webhook will not fire.
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add new */}
        <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Add a webhook
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Label</span>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="#proposals notifications"
                className="app-input"
                maxLength={120}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Webhook URL</span>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/T…"
                className="app-input font-mono text-xs"
                maxLength={2000}
                type="url"
              />
            </label>
          </div>
          <div className="mt-3">
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
              Fire on these events
            </span>
            <div className="flex flex-wrap gap-1.5">
              {NOTIFY_EVENTS.map((e) => {
                const active = newEvents.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggleNewEvent(e.id)}
                    className={cn(
                      "rounded-[6px] border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition",
                      active
                        ? "border-[var(--brand-600)] bg-[var(--brand-200)] text-[var(--brand-700)]"
                        : "border-[var(--border-2)] bg-white text-[var(--text-4)] hover:text-[var(--text-2)]",
                    )}
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleCreate}
              loading={creating}
              disabled={
                newLabel.trim().length === 0 ||
                newUrl.trim().length === 0 ||
                newEvents.length === 0
              }
              leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
            >
              Add webhook
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Branded subdomain for public share URLs (P5.19).
 *
 * Flow:
 *   1. Operator enters a hostname like `docs.acme.com`. We POST it, mint a verification token,
 *      and surface the TXT record they need to add at `_foundry.docs.acme.com`.
 *   2. Operator adds the TXT record at their DNS host. Returns here, clicks Verify.
 *   3. We DNS-lookup the TXT record server-side. On match, mark verified; share URLs now use
 *      the branded host.
 *
 * Vercel domain configuration (pointing the apex A/CNAME at our project) is a separate step
 * outside this UI — we surface a reminder in the success state.
 */
interface CustomHostnameState {
  hostname: string | null;
  verified: boolean;
  instructions: { recordName: string; recordType: "TXT"; recordValue: string } | null;
}

function CustomHostnameSection() {
  const [state, setState] = useState<CustomHostnameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "verify" | "delete">(null);
  const [draft, setDraft] = useState("");

  async function reload() {
    setError(null);
    try {
      const res = await apiFetch<CustomHostnameState>("/api/settings/custom-hostname");
      setState(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleSave() {
    if (draft.trim().length === 0) return;
    setBusy("save");
    setError(null);
    try {
      const res = await apiFetch<CustomHostnameState>("/api/settings/custom-hostname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: draft.trim() }),
      });
      setState(res);
      setDraft("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleVerify() {
    setBusy("verify");
    setError(null);
    try {
      await apiFetch("/api/settings/custom-hostname/verify", { method: "POST" });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove the custom hostname? Public share links will revert to the default Vercel URL.")) return;
    setBusy("delete");
    try {
      await apiFetch("/api/settings/custom-hostname", { method: "DELETE" });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">BRANDED SHARE DOMAIN</span>
        <span className="widget-header-right">
          {state?.verified ? "VERIFIED" : state?.hostname ? "PENDING" : "DEFAULT"}
        </span>
      </div>

      <div className="space-y-5 p-6">
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Replace <code className="font-mono text-[12px] text-[var(--text-2)]">foundry-by-gitwork.vercel.app/docs/&hellip;</code>{" "}
          on public share links with your own subdomain &mdash;{" "}
          <code className="font-mono text-[12px] text-[var(--text-2)]">docs.yourcompany.com/&hellip;</code>. Once verified,
          every share URL we generate uses the branded host instead.
        </p>

        {error ? <p className="text-sm font-medium text-[var(--danger-500)]">{error}</p> : null}

        {state === null ? (
          <p className="text-sm text-[var(--text-3)]">Loading…</p>
        ) : !state.hostname ? (
          <div className="space-y-3 rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">
                Subdomain you want to use
              </span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="docs.yourcompany.com"
                className="app-input font-mono text-sm"
                maxLength={253}
              />
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSave}
                loading={busy === "save"}
                disabled={draft.trim().length === 0}
              >
                Save &amp; get DNS instructions
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3">
              <div>
                <p className="font-mono text-[14px] font-medium text-[var(--text-1)]">{state.hostname}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
                  {state.verified
                    ? "Verified — share links now use this domain."
                    : "Awaiting DNS verification."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!state.verified ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleVerify}
                    loading={busy === "verify"}
                  >
                    Verify DNS
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="utility"
                  size="sm"
                  onClick={handleDelete}
                  loading={busy === "delete"}
                  className="text-rose-600 hover:text-rose-700"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {!state.verified && state.instructions ? (
              <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                  Step 1 · Add this TXT record
                </p>
                <div className="mt-3 grid gap-2 text-[12px] font-mono sm:grid-cols-[80px_1fr]">
                  <span className="text-[var(--text-4)]">Name</span>
                  <code className="break-all text-[var(--text-1)]">{state.instructions.recordName}</code>
                  <span className="text-[var(--text-4)]">Type</span>
                  <code className="text-[var(--text-1)]">{state.instructions.recordType}</code>
                  <span className="text-[var(--text-4)]">Value</span>
                  <code className="break-all text-[var(--text-1)]">{state.instructions.recordValue}</code>
                </div>
                <p className="mt-3 text-[12px] leading-6 text-[var(--text-3)]">
                  After adding the record, click <strong>Verify DNS</strong>. Propagation usually
                  takes 1&ndash;5 minutes but can be up to an hour.
                </p>
                <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                  Step 2 · Point the subdomain at Vercel
                </p>
                <p className="mt-2 text-[12px] leading-6 text-[var(--text-3)]">
                  Add <code className="font-mono text-[var(--text-2)]">{state.hostname}</code> as a
                  domain on the Foundry project in Vercel, then add a CNAME record at your DNS host
                  pointing to <code className="font-mono text-[var(--text-2)]">cname.vercel-dns.com</code>.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
