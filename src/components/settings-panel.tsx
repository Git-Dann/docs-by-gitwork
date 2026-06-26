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
  bulkImportCandidates,
  type IntegrationsResponse, type ModelOption, type TeamMember,
  type BulkImportCandidateRow, type BulkImportResult,
} from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import { useUpdateWorkspaceBranding, useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { useUpdateWorkspaceDefaults, useWorkspaceDefaults } from "@/hooks/use-workspace-defaults";
import { Button } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import type { RateBillingPeriod, RateCardPersonRecord } from "@/types/rate-card";
import { MODULE_PERMISSIONS, isAtLeast, type RoleId } from "@/types/auth";
import { AgentsPanel } from "@/components/settings/agents-panel";
import { ChecksPanel } from "@/components/settings/checks-panel";
import { SavedIndicator } from "@/components/settings/saved-indicator";
import { SettingsCard } from "@/components/settings/settings-card";
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
  | "pulse-pricing"
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
  { id: "pulse-pricing", label: "Pulse Pricing", adminOnly: true },
  { id: "developer", label: "Developer", adminOnly: true },
];

const COMMON_CURRENCIES = ["USD", "GBP", "EUR", "AED", "SAR", "CAD", "AUD"] as const;

/**
 * Copy-pasteable Slack app manifest. Kept in source so scope changes are PR-reviewable
 * (the canonical file lives at docs/slack-app-manifest.json — keep both in sync).
 * The `_comment` field is dropped because Slack rejects unknown top-level keys.
 */
const SLACK_APP_MANIFEST_JSON = JSON.stringify(
  {
    display_information: {
      name: "Foundry by Gitwork",
      description: "Foundry's standup, roll-up and client-channel automation for the Gitwork team.",
      background_color: "#1A1A1A",
    },
    features: { bot_user: { display_name: "Foundry", always_online: false } },
    oauth_config: {
      scopes: {
        bot: [
          "chat:write",
          "chat:write.public",
          "chat:write.customize",
          "channels:read",
          "channels:manage",
          "groups:read",
          "groups:write",
          "users:read",
          "users:read.email",
          "team:read",
          "conversations.connect:write",
          "conversations.connect:manage",
          "commands",
        ],
      },
    },
    settings: {
      interactivity: {
        is_enabled: true,
        request_url: "https://foundry.gitwork.co.uk/api/webhooks/slack/interactions",
      },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  },
  null,
  2,
);
const RATE_BILLING_PERIOD_OPTIONS: RateBillingPeriod[] = ["DAY", "WEEK", "MONTH"];

export function SettingsPanel({
  apiKeyConfigured,
}: {
  apiKeyConfigured: boolean;
}) {
  const { data: session } = useSession();
  const isAdmin = isAtLeast(session?.user?.role ?? "", "ADMIN");
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
      {activeTab === "pulse-pricing" && isAdmin && <PulsePricingTab />}
      {activeTab === "developer" && isAdmin && <DeveloperTab apiKeyConfigured={apiKeyConfigured} />}
    </div>
  );
}

export function GeneralTab() {
  const defaultsQuery = useWorkspaceDefaults();
  const updateDefaults = useUpdateWorkspaceDefaults();
  const brandingQuery = useWorkspaceBranding();
  const updateBranding = useUpdateWorkspaceBranding();

  const defaults = defaultsQuery.data;
  const branding = brandingQuery.data;
  const snippets = defaults?.objectiveSnippets ?? [];

  function patchDefaults(input: Partial<{ preparedBy: string; team: string; contactDetails: string }>) {
    updateDefaults.mutate(input);
  }

  function updateSnippets(next: Array<{ title: string; description: string }>) {
    updateDefaults.mutate({ objectiveSnippets: next });
  }

  return (
    <div className="proposal-form-theme space-y-6">
      <SettingsCard
        number="01"
        title="Proposal defaults"
        right={<SavedIndicator mutation={updateDefaults} />}
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Shared defaults pre-filled across proposals and sign-off sections. Saved to the
          workspace so every teammate sees the same values.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <FieldInput
            label="Prepared by"
            value={defaults?.preparedBy ?? ""}
            onChange={(preparedBy) => patchDefaults({ preparedBy })}
            placeholder="Gitwork"
          />
          <FieldInput
            label="Team / department"
            value={defaults?.team ?? ""}
            onChange={(team) => patchDefaults({ team })}
            placeholder="Product & Delivery"
          />
          <FieldInput
            label="Contact details"
            value={defaults?.contactDetails ?? ""}
            onChange={(contactDetails) => patchDefaults({ contactDetails })}
            placeholder="hello@gitwork.co.uk"
          />
        </div>
      </SettingsCard>

      <SettingsCard
        number="02"
        title="Workspace logo"
        right={<SavedIndicator mutation={updateBranding} />}
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          The workspace logo used wherever a document doesn&apos;t specify its own — also appears
          on scan reports and (future) email signatures. Templates in Docs carry their own cover
          art, so this is the fallback.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:max-w-md">
          <div className="space-y-2">
            <FieldLabel>Workspace logo</FieldLabel>
            <ImagePicker
              value={branding?.brandLogoUrl ?? ""}
              onChange={(value) => updateBranding.mutate({ brandLogoUrl: value })}
              previewClassName="h-36 w-full"
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        number="03"
        title="Confidentiality defaults"
        right={<SavedIndicator mutation={updateBranding} />}
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          The cover editor uses an internal/external toggle and resolves the final copy from
          these defaults.
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
      </SettingsCard>

      <SettingsCard
        number="04"
        title="Objective snippets"
        right={
          <div className="flex items-center gap-3">
            <SavedIndicator mutation={updateDefaults} />
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
        }
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Reusable objectives available inside the proposal builder — pick from a list instead
          of retyping for every new doc.
        </p>

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
                  placeholder="Reduce proposal cycle time"
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
                  placeholder="Decrease proposal drafting and review timeline by at least 40%."
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
      </SettingsCard>
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
      <SettingsCard
        number="01"
        title="Workspace logo"
        right={<SavedIndicator mutation={updateBranding} />}
      >
          <p className="text-sm leading-6 text-[var(--text-3)]">
            The workspace logo used wherever a document doesn&apos;t specify its own. Templates
            in Docs now carry their own cover art and accents, so this is the fallback for ad-hoc
            documents plus places outside Docs (email signatures, scan reports, the favicon when
            we get there).
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:max-w-md">
            <div className="space-y-2">
              <FieldLabel>Workspace logo</FieldLabel>
              <ImagePicker
                value={workspaceBranding.brandLogoUrl ?? ""}
                onChange={(value) => patch("brandLogoUrl", value)}
                previewClassName="h-36 w-full"
              />
              <p className="text-xs text-[var(--text-4)]">
                Used as the cover logo when a document has no template-defined override.
              </p>
            </div>
          </div>

          <p className="mt-6 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-3)]">
            <strong>Cover accents moved to templates.</strong> Edit per-template branding in
            Settings → Templates so different document types can carry their own visual style.
            Confidentiality copy is now part of Document defaults.
          </p>
      </SettingsCard>
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
      <SettingsCard
        number="01"
        title="Confidentiality defaults"
        right={<SavedIndicator mutation={updateBranding} />}
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
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
      </SettingsCard>

      <SettingsCard
        number="02"
        title="Objective snippets"
        right={
          <div className="flex items-center gap-3">
            <SavedIndicator mutation={updateDefaults} />
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
        }
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Reusable objectives available inside the proposal builder.
        </p>

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
      </SettingsCard>
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
      <SettingsCard
        number="01"
        title="People & Rates"
        right={
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
        }
      >
        <p className="max-w-3xl text-sm leading-6 text-[var(--text-3)]">
          This is the shared roster Axis mirrors for proposal pricing. Store source currency and
          billing period here, then let Axis convert everything to a GBP day rate on-device.
        </p>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,400px)]">
          <section className="overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] shadow-[var(--shadow-xs)]">
            <div className="border-b border-[var(--border-2)] px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-[var(--text-1)]">Roster</h3>
                    <span className="inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
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
                                <span className="inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
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
                              <span className="inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
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
                  className="app-select"
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
                  className="app-select"
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
      </SettingsCard>
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
      <SettingsCard number="01" title="AI analysis engine">
        <p className="max-w-2xl text-sm leading-6 text-[var(--text-3)]">
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
      </SettingsCard>

      {/* ── Google Workspace — service account ────────────────────── */}
      <GoogleServiceAccountSection config={config} onSaved={setConfig} />

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
      <SettingsCard
        number="01"
        title="Team members"
        right={
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
        }
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Manage who can access Foundry. Admins have full access. Staff access is limited to
          modules you enable for them.
        </p>

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
                        "rounded-[4px] px-2.5 py-0.5 text-xs font-semibold",
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
      </SettingsCard>

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
  const [role, setRole] = useState<RoleId>(member.role);
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

function GoogleServiceAccountSection({
  config,
  onSaved,
}: {
  config: IntegrationsResponse | null;
  onSaved: (updated: IntegrationsResponse) => void;
}) {
  const [json, setJson] = useState("");
  const [subjectEmail, setSubjectEmail] = useState(config?.googleSubjectEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Keep subject email in sync if config loads after mount
  useEffect(() => {
    if (config?.googleSubjectEmail) setSubjectEmail(config.googleSubjectEmail);
  }, [config?.googleSubjectEmail]);

  async function handleSave() {
    setError(null);
    setSaved(false);

    // Validate JSON if provided
    if (json.trim()) {
      try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        if (parsed.type !== "service_account") {
          setError("This doesn't look like a service account JSON — check the 'type' field.");
          return;
        }
      } catch {
        setError("Invalid JSON — paste the full file contents from Google Cloud Console.");
        return;
      }
    }

    setSaving(true);
    try {
      if (json.trim()) await saveIntegrations({ googleServiceAccountJson: json.trim() });
      if (subjectEmail.trim()) await saveIntegrations({ googleSubjectEmail: subjectEmail.trim() });
      const updated = await getIntegrations();
      onSaved(updated);
      setJson("");
      setSaved(true);
    } catch {
      setError("Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  }

  const isConfigured = config?.googleServiceAccountJsonSet ?? false;

  return (
    <SettingsCard
      number="02"
      title="Google Workspace"
      right={
        <>
          <span className={`h-1.5 w-1.5 rounded-full ${isConfigured ? "bg-emerald-500" : "bg-amber-400"}`} />
          {isConfigured ? "Configured" : "Not configured"}
        </>
      }
    >
      <p className="max-w-2xl text-sm leading-6 text-[var(--text-3)]">
        Paste the service account JSON from Google Cloud Console. Care uses this with domain-wide delegation
        to read Gmail inboxes configured per-connector — no per-user OAuth required.
      </p>

      <div className="mt-5 space-y-4">
        {/* JSON textarea */}
        <label className="block space-y-1.5">
          <span className="app-field-label">{isConfigured ? "Replace JSON (leave blank to keep existing)" : "Service account JSON"}</span>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={5}
            className="app-input w-full font-mono text-[11px] leading-5"
            placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
            spellCheck={false}
          />
        </label>

        {/* Subject email */}
        <label className="block space-y-1.5">
          <span className="app-field-label">Default inbox to read (workspace-level fallback)</span>
          <input
            type="email"
            value={subjectEmail}
            onChange={(e) => setSubjectEmail(e.target.value)}
            className="app-input w-full"
            placeholder="support@gitwork.co.uk"
          />
          <p className="text-[11px] text-[var(--text-4)]">
            Used when a Gmail connector doesn&apos;t specify its own inbox. Each connector can override this.
          </p>
        </label>

        {error && (
          <p className="rounded-[6px] bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}
        {saved && (
          <p className="rounded-[6px] bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Saved.</p>
        )}

        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={saving}
          onClick={() => void handleSave()}
        >
          Save
        </Button>
      </div>
    </SettingsCard>
  );
}

const SLACK_ROUTE_EVENTS: { id: string; label: string; module: string }[] = [
  { id: "pulse.scan_failed", label: "Pulse scan failed", module: "Pulse" },
  { id: "pulse.monitor_drift", label: "Pulse monitor drift", module: "Pulse" },
  { id: "study.report_ready", label: "Study report ready", module: "Study" },
  { id: "care.digest", label: "Care hourly digest", module: "Care" },
  { id: "care.ticket_created", label: "Care ticket created", module: "Care" },
  { id: "care.ticket_escalated", label: "Care ticket escalated", module: "Care" },
  { id: "docs.viewed_by_client", label: "Doc viewed by client", module: "Docs" },
  { id: "docs.signed", label: "Doc signed", module: "Docs" },
];

interface SlackAvailableChannelRow {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  memberCount: number;
}

function SlackSection({
  config,
  onSaved,
}: {
  config: IntegrationsResponse | null;
  onSaved: (updated: IntegrationsResponse) => void;
}) {
  const [tokenInput, setTokenInput] = useState("");
  const [signingSecretInput, setSigningSecretInput] = useState("");
  const [appIdInput, setAppIdInput] = useState("");
  const [showManifest, setShowManifest] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState<SlackAvailableChannelRow[] | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isConnected = Boolean(config?.slackBotTokenMasked);
  const isFullyConfigured = isConnected && Boolean(config?.slackSigningSecretSet);
  const verified = Boolean(config?.slackTeamId);

  useEffect(() => {
    if (!config) return;
    const saved = (config.slackChannels ?? []) as Array<{ id: string; name: string }>;
    const ids = new Set(saved.map((c) => c.id));
    if (ids.size === 0 && config.slackSummaryChannelId) {
      ids.add(config.slackSummaryChannelId);
    }
    setSelectedChannelIds(ids);
    setRoutes(config.channelRoutes ?? {});
  }, [config]);

  // Auto-load channels from Slack the first time we have a token connected.
  useEffect(() => {
    if (available !== null) return;
    if (!config?.slackBotTokenMasked) return;
    void loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.slackBotTokenMasked]);

  async function loadChannels() {
    setLoadingChannels(true);
    setChannelsError(null);
    try {
      const channels = await apiFetch<{ channels: SlackAvailableChannelRow[] }>(
        "/api/integrations/slack/channels",
      );
      setAvailable(channels.channels);
    } catch (err) {
      setChannelsError(
        err instanceof Error ? err.message : "Couldn't fetch channels from Slack.",
      );
    } finally {
      setLoadingChannels(false);
    }
  }

  function toggleChannel(id: string) {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      // Build slackChannels from currently-selected IDs. Resolve names from the live list
      // when possible; for any IDs that no longer appear (bot removed?), fall back to the
      // previously-saved name so we don't lose it.
      const previouslySaved = (config?.slackChannels ?? []) as Array<{ id: string; name: string }>;
      const nameForId = new Map<string, string>();
      for (const c of previouslySaved) nameForId.set(c.id, c.name);
      for (const c of available ?? []) nameForId.set(c.id, c.name);

      const finalChannels = Array.from(selectedChannelIds).map((id) => ({
        id,
        name: nameForId.get(id) ?? id,
      }));

      const payload: Parameters<typeof saveIntegrations>[0] = {};
      if (tokenInput.trim()) payload.slackBotToken = tokenInput.trim();
      if (signingSecretInput.trim()) payload.slackSigningSecret = signingSecretInput.trim();
      if (appIdInput.trim()) payload.slackAppId = appIdInput.trim();
      payload.slackChannels = finalChannels;
      payload.channelRoutes = routes;

      await saveIntegrations(payload);
      const updated = await getIntegrations();
      onSaved(updated);
      setTokenInput("");
      setSigningSecretInput("");
      setAppIdInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // If they pasted a new token, refresh the channel list so it reflects the new auth.
      if (tokenInput.trim()) void loadChannels();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed — please try again.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Save what's pasted AND run auth.test against the resulting token. On success the server
   * persists the returned team / bot user / team id so the diagnostics card lights up.
   */
  async function handleSaveAndVerify() {
    setVerifying(true);
    setSaveError(null);
    try {
      const payload: Parameters<typeof saveIntegrations>[0] = { slackVerify: true };
      if (tokenInput.trim()) payload.slackBotToken = tokenInput.trim();
      if (signingSecretInput.trim()) payload.slackSigningSecret = signingSecretInput.trim();
      if (appIdInput.trim()) payload.slackAppId = appIdInput.trim();
      await saveIntegrations(payload);
      const updated = await getIntegrations();
      onSaved(updated);
      setTokenInput("");
      setSigningSecretInput("");
      setAppIdInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void loadChannels();
    } catch (err) {
      // The server returns Slack's verbatim `error` (e.g. `invalid_auth`, `missing_scope`).
      setSaveError(err instanceof Error ? err.message : "Verify failed — check the credentials.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Slack? This clears the bot token, signing secret, and cached channel list.")) {
      return;
    }
    setDisconnecting(true);
    setSaveError(null);
    try {
      await saveIntegrations({ slackDisconnect: true });
      const updated = await getIntegrations();
      onSaved(updated);
      setAvailable(null);
      setSelectedChannelIds(new Set());
      setRoutes({});
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Disconnect failed — please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  // Build the dropdown options once — used by the event-routing block below.
  const nameFor = new Map<string, string>();
  for (const c of (config?.slackChannels ?? []) as Array<{ id: string; name: string }>) {
    nameFor.set(c.id, c.name);
  }
  for (const c of available ?? []) nameFor.set(c.id, c.name);
  const routingOptions = Array.from(selectedChannelIds).map((id) => ({
    id,
    name: nameFor.get(id) ?? id,
  }));

  return (
    <SettingsCard number="03" title="Slack">
      <p className="max-w-2xl text-sm leading-6 text-[var(--text-3)]">
        Foundry posts standups, doc events, and the daily roll-up to Slack via an{" "}
        <strong>internal Slack app</strong> (one app, paste credentials, no OAuth). The same app
        also drives interactive cards — &ldquo;Show notes&rdquo;, mark-done buttons, modals — so it
        needs the bot token <em>and</em> the signing secret.
      </p>

      {saveError && (
        <p className="mt-3 rounded-[6px] border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {saveError}
        </p>
      )}

      <div className="mt-5 space-y-4">
        {/* ─── STEP 1 — Credentials (paste, save, verify, diagnostics) ─── */}
        <SlackSubBlock
          step="01"
          title={verified ? "Connection" : "Credentials"}
          right={
            verified ? (
              <span className="text-[10px] uppercase tracking-[0.08em] text-emerald-600">Verified</span>
            ) : null
          }
        >
          {verified ? (
            <>
              <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
                <dt className="text-[var(--text-4)]">Team</dt>
                <dd className="font-medium text-[var(--text-1)]">{config?.slackTeamName ?? config?.slackTeamId}</dd>
                <dt className="text-[var(--text-4)]">Bot user</dt>
                <dd className="font-mono text-[var(--text-2)]">{config?.slackBotUserId ?? "—"}</dd>
                <dt className="text-[var(--text-4)]">App id</dt>
                <dd className="font-mono text-[var(--text-2)]">{config?.slackAppId ?? "—"}</dd>
                <dt className="text-[var(--text-4)]">Signing secret</dt>
                <dd className="text-[var(--text-2)]">
                  {config?.slackSigningSecretSet ? "Configured" : (
                    <span className="text-amber-600">Not set — buttons &amp; modals won&rsquo;t work</span>
                  )}
                </dd>
                <dt className="text-[var(--text-4)]">Last successful post</dt>
                <dd className="text-[var(--text-2)]">
                  {config?.lastSlackPostAt ? new Date(config.lastSlackPostAt).toLocaleString() : "—"}
                </dd>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowManifest((v) => !v)}
                  className="text-[11px] font-medium text-[var(--brand-700)] hover:underline"
                >
                  {showManifest ? "Hide manifest" : "View manifest"}
                </button>
                <span className="text-[var(--border-2)]">·</span>
                <button
                  type="button"
                  onClick={() => void handleDisconnect()}
                  disabled={disconnecting}
                  className="text-[11px] font-medium text-rose-600 hover:underline disabled:opacity-40"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </>
          ) : (
            <ol className="space-y-1.5 text-xs leading-relaxed text-[var(--text-3)]">
              <li>
                1. Open{" "}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--brand-700)] hover:underline"
                >
                  api.slack.com/apps
                </a>
                {" "}— update the manifest of the existing Foundry app (or create one from manifest).
              </li>
              <li>2. Install / reinstall to the workspace. Copy the Bot token + Signing Secret + App ID.</li>
              <li>3. Paste them below and click <strong>Save &amp; verify</strong>.</li>
              <li>
                <button
                  type="button"
                  onClick={() => setShowManifest((v) => !v)}
                  className="text-[var(--brand-700)] hover:underline"
                >
                  {showManifest ? "Hide manifest ↑" : "Show manifest ↓"}
                </button>
              </li>
            </ol>
          )}

          {showManifest && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-[6px] border border-[var(--border-3)] bg-white p-3 font-mono text-[11px] leading-relaxed text-[var(--text-2)]">
{SLACK_APP_MANIFEST_JSON}
            </pre>
          )}

          {/* Paste grid: one row when collapsed, sane responsive layout */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                Bot OAuth token
              </label>
              {config?.slackBotTokenMasked && !tokenInput && (
                <div className="mb-1.5 flex items-center gap-2 rounded-[6px] bg-white px-2.5 py-1.5">
                  <span className="font-mono text-[11px] text-[var(--text-2)]">{config.slackBotTokenMasked}</span>
                  <span className="ml-auto text-[10px] text-emerald-600">Connected</span>
                </div>
              )}
              <input
                type="password"
                className="app-input w-full font-mono text-sm"
                placeholder={config?.slackBotTokenMasked ? "Paste new xoxb-… to replace" : "xoxb-…"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                Signing secret
              </label>
              {config?.slackSigningSecretSet && !signingSecretInput && (
                <div className="mb-1.5 flex items-center gap-2 rounded-[6px] bg-white px-2.5 py-1.5">
                  <span className="font-mono text-[11px] text-[var(--text-2)]">••••••••••••••••</span>
                  <span className="ml-auto text-[10px] text-emerald-600">Encrypted</span>
                </div>
              )}
              <input
                type="password"
                className="app-input w-full font-mono text-sm"
                placeholder={config?.slackSigningSecretSet ? "Paste new secret to replace" : "Basic Information → Signing Secret"}
                value={signingSecretInput}
                onChange={(e) => setSigningSecretInput(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                App ID
              </label>
              <input
                type="text"
                className="app-input w-full font-mono text-sm"
                placeholder="A012ABCDEF"
                value={appIdInput || config?.slackAppId || ""}
                onChange={(e) => setAppIdInput(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void handleSaveAndVerify()}
              disabled={verifying || saving}
              className="app-button app-button-primary px-4 py-2 text-sm disabled:opacity-40"
            >
              {verifying ? "Verifying with Slack…" : "Save & verify"}
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving || verifying}
              className="app-button app-button-secondary px-4 py-2 text-sm disabled:opacity-40"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save without verifying"}
            </button>
            {isFullyConfigured && !verified && (
              <span className="text-[11px] text-amber-600">
                Click <strong>Save &amp; verify</strong> to confirm credentials.
              </span>
            )}
          </div>
        </SlackSubBlock>

        {/* ─── STEP 2 — Channels the bot can read ─── */}
        <SlackSubBlock
          step="02"
          title="Channels the bot reads from"
          right={
            <button
              type="button"
              onClick={() => void loadChannels()}
              disabled={loadingChannels || !config?.slackBotTokenMasked}
              className="text-[11px] font-medium text-[var(--brand-700)] hover:underline disabled:opacity-50"
            >
              {loadingChannels ? "Refreshing…" : "Refresh from Slack"}
            </button>
          }
        >
          <p className="mb-2 text-[11px] leading-snug text-[var(--text-4)]">
            Used by AI meeting summaries + Care context lookup. <strong>{selectedChannelIds.size}</strong>{" "}
            selected. Invite the bot from Slack ({`/invite @foundry`}) before selecting — Slack
            won&apos;t let it read history otherwise.
          </p>

          {!config?.slackBotTokenMasked ? (
            <p className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-xs text-[var(--text-3)]">
              Paste a bot token above and Save &amp; verify — the channel list appears once Slack authenticates.
            </p>
          ) : channelsError ? (
            <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {channelsError}
            </div>
          ) : available === null && loadingChannels ? (
            <p className="text-xs text-[var(--text-4)]">Loading channels from Slack…</p>
          ) : (
            <>
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter channels…"
                className="app-input mb-2 w-full text-sm"
              />
              <div className="max-h-64 overflow-y-auto rounded-[8px] border border-[var(--border-2)] bg-white">
                {(available ?? [])
                  .filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
                  .map((ch) => {
                    const checked = selectedChannelIds.has(ch.id);
                    return (
                      <label
                        key={ch.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 border-b border-[var(--border-3)] px-3 py-2 text-sm last:border-b-0",
                          checked ? "bg-[var(--surface-brand)]" : "hover:bg-[var(--surface-1)]",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChannel(ch.id)}
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-[var(--text-1)]">
                            {ch.isPrivate ? "🔒 " : "#"}
                            {ch.name}
                          </span>
                          {!ch.isMember ? (
                            <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">
                              Bot not in channel
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-[var(--text-4)]">
                          {ch.memberCount} members
                        </span>
                      </label>
                    );
                  })}
                {(available ?? []).length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-[var(--text-4)]">
                    No channels visible to this bot.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </SlackSubBlock>

        {/* ─── STEP 3 — Per-event routing ─── */}
        <SlackSubBlock
          step="03"
          title="Per-event routing"
          right={
            <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">
              {Object.keys(routes).length} routed
            </span>
          }
        >
          {routingOptions.length === 0 ? (
            <p className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-xs text-[var(--text-3)]">
              Pick one or more channels in step 02 first — they become the targets here.
            </p>
          ) : (
            <>
              <p className="mb-2 text-[11px] leading-snug text-[var(--text-4)]">
                Where each Foundry event posts. Events left as &ldquo;None&rdquo; skip Slack but still
                fire email / in-app notifications. <strong>Standups + roll-up</strong> use the per-client
                channel on the Client record (Edit client → Slack channels) — they don&apos;t live here.
              </p>
              <div className="space-y-1.5">
                {SLACK_ROUTE_EVENTS.map((event) => (
                  <div
                    key={event.id}
                    className="grid grid-cols-[100px_minmax(0,1fr)_minmax(0,180px)] items-center gap-3 rounded-[6px] border border-[var(--border-3)] bg-white px-3 py-2"
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
                      {routingOptions.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
        </SlackSubBlock>
      </div>
    </SettingsCard>
  );
}

/**
 * Reusable visual chrome for the three Slack sub-blocks. Numbered eyebrow + title +
 * optional right-aligned status / action chip, with a thin divider. Keeps the long
 * Slack card scannable.
 */
function SlackSubBlock({
  step,
  title,
  right,
  children,
}: {
  step: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
      <header className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--border-3)] pb-2">
        <h4 className="flex items-baseline gap-2 text-sm font-semibold tracking-[-0.01em] text-[var(--text-1)]">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
            {step}
          </span>
          {title}
        </h4>
        {right ? <div>{right}</div> : null}
      </header>
      {children}
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
    <SettingsCard number="04" title="Outbound email">
      <p className="max-w-2xl text-sm leading-6 text-[var(--text-3)]">
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
    </SettingsCard>
  );
}

interface PulsePricingConfigState { fxFromUsd: number; dayRateOverrideGbp?: number; seniority?: "mid" | "senior" }

export function PulsePricingTab() {
  const [config, setConfig] = useState<PulsePricingConfigState | null>(null);
  const [fx, setFx] = useState("");
  const [dayRate, setDayRate] = useState("");
  const [seniority, setSeniority] = useState<"mid" | "senior">("senior");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let live = true;
    apiFetch<{ config: PulsePricingConfigState }>("/api/workspace/pulse-pricing")
      .then((res) => {
        if (!live) return;
        setConfig(res.config);
        setFx(String(res.config.fxFromUsd ?? 0.79));
        setDayRate(res.config.dayRateOverrideGbp ? String(res.config.dayRateOverrideGbp) : "");
        setSeniority(res.config.seniority ?? "senior");
      })
      .catch(() => { if (live) setStatus("error"); });
    return () => { live = false; };
  }, []);

  async function save() {
    setStatus("saving");
    try {
      const res = await apiFetch<{ config: PulsePricingConfigState }>("/api/workspace/pulse-pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fxFromUsd: Number(fx) || 0.79,
          dayRateOverrideGbp: dayRate.trim() ? Number(dayRate) : null,
          seniority,
        }),
      });
      setConfig(res.config);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="proposal-form-theme space-y-6">
      <SettingsCard
        number="01"
        title="Pulse engagement pricing"
        right={<span className="text-xs text-[var(--text-4)]">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Error" : ""}</span>}
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Controls the deterministic engagement price bands Pulse shows on scans (1/2/3-dev tiers).
          The day rate is blended from your rate card by default — converted to GBP with the FX rate
          below — or you can pin a fixed day rate. These figures are internal and never appear on
          client-shared reports.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <FieldInput label="USD → GBP rate" value={fx} onChange={setFx} type="number" placeholder="0.79" />
          <FieldInput label="Day-rate override (£, optional)" value={dayRate} onChange={setDayRate} type="number" placeholder="leave blank to blend from rate card" />
          <label className="block space-y-1.5">
            <FieldLabel>Seniority band</FieldLabel>
            <select className="app-select" value={seniority} onChange={(e) => setSeniority(e.target.value as "mid" | "senior")}>
              <option value="senior">Senior / lead</option>
              <option value="mid">All / mid</option>
            </select>
          </label>
        </div>
        <div className="mt-5">
          <Button onClick={save} disabled={status === "saving" || !config}>Save pricing</Button>
        </div>
      </SettingsCard>
    </div>
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
    <SettingsCard number="02" title="Bulk import candidates">
      <p className="max-w-2xl text-sm leading-6 text-[var(--text-3)]">
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
    </SettingsCard>
  );
}

// DemoDataCleanupSection has been removed — the seed demo developers and rate-card
// people have long since been cleaned up. If we ever need a similar one-shot
// maintenance tool, restore from git history (commit before this one).

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
    <SettingsCard number="01" title="External API Key">
      <p className="max-w-2xl text-sm leading-6 text-[var(--text-3)]">
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
                <span className="shrink-0 rounded-[4px] bg-[var(--mist)] px-2.5 py-1 text-xs font-medium text-[var(--brand-700)]">
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
    </SettingsCard>
  );
}

// Method-coloured chip used in the endpoint table. Same colour mapping as /api-docs.
function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "text-emerald-600";
    case "POST":
      return "text-sky-600";
    case "PATCH":
      return "text-amber-600";
    case "PUT":
      return "text-violet-600";
    case "DELETE":
      return "text-rose-600";
    default:
      return "text-[var(--text-3)]";
  }
}

interface ApiEndpoint {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  label: string;
}

interface ApiGroup {
  name: string;
  description: string;
  endpoints: ApiEndpoint[];
}

/**
 * Endpoint reference for the Developer settings page. Grouped by module so it stays
 * scannable as Foundry grows. Internal-only routes (cron, dev seed, webhooks) are
 * deliberately omitted — those aren't part of the external contract.
 *
 * Keep in sync with /app/api-docs (the deep reference) and the actual files under
 * src/app/api/*. When adding a new public endpoint, slot it into the right group.
 */
const API_GROUPS: ApiGroup[] = [
  {
    name: "Foundation",
    description: "Health, current user, audit history.",
    endpoints: [
      { method: "GET", path: "/api/health", label: "Health check (public)" },
      { method: "GET", path: "/api/account", label: "Signed-in user profile" },
      { method: "PATCH", path: "/api/account", label: "Update profile avatar" },
      { method: "GET", path: "/api/audit-log", label: "Workspace audit history (admin)" },
    ],
  },
  {
    name: "Workspace",
    description: "Branding, proposal defaults, AI providers + integrations, settings.",
    endpoints: [
      { method: "GET", path: "/api/workspace/branding", label: "Workspace branding" },
      { method: "PATCH", path: "/api/workspace/branding", label: "Update branding" },
      { method: "GET", path: "/api/workspace/defaults", label: "Workspace proposal defaults" },
      { method: "PATCH", path: "/api/workspace/defaults", label: "Update proposal defaults" },
      { method: "GET", path: "/api/settings/integrations", label: "AI + Google + Slack + email config" },
      { method: "PUT", path: "/api/settings/integrations", label: "Update integrations config" },
      { method: "GET", path: "/api/settings/models", label: "List available AI models (?provider=)" },
      { method: "GET", path: "/api/settings/agents", label: "List configured AI agents" },
      { method: "PATCH", path: "/api/settings/agents/:agentKey", label: "Update agent override" },
      { method: "GET", path: "/api/settings/checks", label: "List Pulse check configs" },
      { method: "PATCH", path: "/api/settings/checks/:checkKey", label: "Update check config" },
    ],
  },
  {
    name: "Team & access",
    description: "Invites, members, roles & permissions.",
    endpoints: [
      { method: "GET", path: "/api/team/invites", label: "List invites" },
      { method: "POST", path: "/api/team/invites", label: "Create invite link" },
      { method: "PATCH", path: "/api/team/invites/:id", label: "Update invite label" },
      { method: "DELETE", path: "/api/team/invites/:id", label: "Revoke / remove invite" },
      { method: "GET", path: "/api/team/members", label: "List members" },
      { method: "PATCH", path: "/api/team/members/:id", label: "Update role / permissions (admin)" },
      { method: "DELETE", path: "/api/team/members/:id", label: "Remove member (admin)" },
    ],
  },
  {
    name: "Notifications",
    description: "Per-user channel preferences, digests, quiet hours.",
    endpoints: [
      { method: "GET", path: "/api/notifications/preferences", label: "Current user preferences" },
      { method: "PATCH", path: "/api/notifications/preferences", label: "Update preferences" },
    ],
  },
  {
    name: "Docs (Proposals & templates)",
    description: "Documents, sections, costing, exports, templates.",
    endpoints: [
      { method: "GET", path: "/api/proposals", label: "List documents" },
      { method: "POST", path: "/api/proposals", label: "Create document" },
      { method: "GET", path: "/api/proposals/:id", label: "Get document" },
      { method: "PATCH", path: "/api/proposals/:id", label: "Update document" },
      { method: "POST", path: "/api/proposals/:id/duplicate", label: "Duplicate" },
      { method: "POST", path: "/api/proposals/:id/archive", label: "Archive" },
      { method: "DELETE", path: "/api/proposals/:id/delete", label: "Delete" },
      { method: "POST", path: "/api/proposals/:id/costing", label: "Save costing" },
      { method: "POST", path: "/api/proposals/:id/timeline", label: "Save timeline" },
      { method: "POST", path: "/api/proposals/:id/engagement", label: "Save CTAs + links" },
      { method: "POST", path: "/api/proposals/:id/export", label: "Request export" },
      { method: "GET", path: "/api/proposals/:id/relations", label: "Linked clients / scans / studies" },
      { method: "POST", path: "/api/proposals/bulk", label: "Bulk-create from JSON" },
      { method: "GET", path: "/api/documents/:id/comments", label: "Comments on a document" },
      { method: "POST", path: "/api/documents/:id/comments", label: "Add comment" },
      { method: "GET", path: "/api/documents/:id/versions", label: "Version history" },
      { method: "POST", path: "/api/documents/:id/snapshot", label: "Create version snapshot" },
      { method: "POST", path: "/api/documents/:id/share", label: "Generate public share token" },
      { method: "POST", path: "/api/documents/:id/ai/chat", label: "AI chat on document" },
      { method: "POST", path: "/api/documents/:id/ai/section", label: "Generate one section" },
      { method: "POST", path: "/api/documents/:id/ai/draft", label: "Draft entire document" },
      { method: "POST", path: "/api/documents/:id/ai/apply", label: "Apply AI diff" },
      { method: "POST", path: "/api/documents/:id/signature-requests", label: "Create signature request" },
      { method: "GET", path: "/api/templates", label: "List document templates" },
      { method: "GET", path: "/api/templates/:id", label: "Get template" },
      { method: "PATCH", path: "/api/templates/:id", label: "Update template (sections / default)" },
      { method: "POST", path: "/api/templates/:id/duplicate", label: "Duplicate template" },
      { method: "POST", path: "/api/templates/from-document/:id", label: "Promote document to template" },
    ],
  },
  {
    name: "Portal (Clients)",
    description: "Workspace clients + their platforms, designs, schedule.",
    endpoints: [
      { method: "GET", path: "/api/clients", label: "List clients" },
      { method: "POST", path: "/api/clients", label: "Create client" },
      { method: "GET", path: "/api/clients/:slug", label: "Get client with proposals, designs, etc." },
      { method: "PATCH", path: "/api/clients/:slug", label: "Update client" },
      { method: "GET", path: "/api/clients/:slug/platforms", label: "Client integrations / platforms" },
      { method: "POST", path: "/api/clients/:slug/platforms", label: "Add platform link" },
      { method: "PATCH", path: "/api/clients/:slug/platforms/:platformId", label: "Update platform" },
      { method: "DELETE", path: "/api/clients/:slug/platforms/:platformId", label: "Remove platform" },
      { method: "GET", path: "/api/clients/:slug/designs", label: "Client design refs" },
      { method: "POST", path: "/api/clients/:slug/designs", label: "Add design ref" },
      { method: "GET", path: "/api/clients/:slug/schedule", label: "Engagement schedule" },
      { method: "GET", path: "/api/clients/:slug/slack-activity", label: "Slack channel digest + recent messages" },
    ],
  },
  {
    name: "Code (CodeClear)",
    description: "Developer roster, scoring, GitHub analysis, placements.",
    endpoints: [
      { method: "GET", path: "/api/codeclear/stats", label: "Code overview stats" },
      { method: "GET", path: "/api/codeclear/candidates", label: "List developers" },
      { method: "POST", path: "/api/codeclear/candidates", label: "Create developer" },
      { method: "PATCH", path: "/api/codeclear/candidates", label: "Bulk stage / re-check update" },
      { method: "GET", path: "/api/codeclear/candidates/:id", label: "Get developer" },
      { method: "PATCH", path: "/api/codeclear/candidates/:id", label: "Update developer" },
      { method: "DELETE", path: "/api/codeclear/candidates/:id", label: "Delete developer" },
      { method: "POST", path: "/api/codeclear/candidates/:id/notes", label: "Add timeline note" },
      { method: "PUT", path: "/api/codeclear/candidates/:id/score", label: "Finalise scorecard" },
      { method: "GET", path: "/api/codeclear/candidates/:id/github-analysis/runs", label: "List GitHub analysis runs" },
      { method: "POST", path: "/api/codeclear/candidates/:id/github-analysis/runs", label: "Run GitHub analysis" },
      { method: "POST", path: "/api/codeclear/candidates/:id/github-analysis/runs/:runId/apply", label: "Apply analysis draft" },
      { method: "GET", path: "/api/codeclear/candidates/:id/scorecard", label: "Export scorecard" },
      { method: "PATCH", path: "/api/codeclear/candidates/:id/current-clients", label: "Set assigned clients" },
      { method: "GET", path: "/api/codeclear/candidates/:id/placements", label: "List placements" },
      { method: "POST", path: "/api/codeclear/candidates/:id/placements", label: "Create placement" },
      { method: "PATCH", path: "/api/codeclear/candidates/:id/placements/:placementId", label: "Update placement dates" },
      { method: "DELETE", path: "/api/codeclear/candidates/:id/placements/:placementId", label: "End placement" },
      { method: "GET", path: "/api/codeclear/schedule", label: "Cross-team allocation view" },
      { method: "GET", path: "/api/codeclear/tech-stacks", label: "Workspace tech-stack taxonomy" },
    ],
  },
  {
    name: "Pulse",
    description: "Project health scans, monitors, alerts.",
    endpoints: [
      { method: "GET", path: "/api/pulse/stats", label: "Workspace Pulse stats" },
      { method: "GET", path: "/api/pulse/scans", label: "List scans" },
      { method: "POST", path: "/api/pulse/scans", label: "Trigger new scan" },
      { method: "GET", path: "/api/pulse/monitors", label: "List monitors" },
      { method: "POST", path: "/api/pulse/monitors", label: "Create monitor" },
      { method: "PATCH", path: "/api/pulse/monitors/:monitorId", label: "Update monitor" },
      { method: "DELETE", path: "/api/pulse/monitors/:monitorId", label: "Remove monitor" },
    ],
  },
  {
    name: "Study",
    description: "AI-powered user research studies.",
    endpoints: [
      { method: "GET", path: "/api/study/studies", label: "List studies" },
      { method: "POST", path: "/api/study/studies", label: "Create study" },
      { method: "GET", path: "/api/study/studies/:studyId", label: "Get study" },
      { method: "PATCH", path: "/api/study/studies/:studyId", label: "Update study" },
      { method: "POST", path: "/api/study/studies/:studyId/plan", label: "Generate research plan" },
      { method: "POST", path: "/api/study/studies/:studyId/run", label: "Run study" },
      { method: "GET", path: "/api/study/studies/:studyId/stream", label: "Stream live run (SSE)" },
      { method: "GET", path: "/api/study/personas", label: "Available personas" },
    ],
  },
  {
    name: "Care (Support)",
    description: "Client support clients, conversations, tickets, workflow rules.",
    endpoints: [
      { method: "GET", path: "/api/support/clients", label: "List support clients" },
      { method: "POST", path: "/api/support/clients", label: "Create support client" },
      { method: "GET", path: "/api/support/clients/:clientId", label: "Get support client" },
      { method: "GET", path: "/api/support/clients/:clientId/conversations", label: "List conversations" },
      { method: "POST", path: "/api/support/clients/:clientId/conversations/:convId/ai-draft", label: "AI draft reply" },
      { method: "GET", path: "/api/support/clients/:clientId/tickets", label: "List tickets" },
      { method: "POST", path: "/api/support/clients/:clientId/tickets", label: "Create ticket" },
      { method: "GET", path: "/api/support/clients/:clientId/connections", label: "Inbound connectors (Gmail, Discord, Reddit)" },
      { method: "POST", path: "/api/support/clients/:clientId/connections/:connId/sync", label: "Manual sync now" },
      { method: "GET", path: "/api/support/clients/:clientId/workflow-rules", label: "List workflow rules" },
      { method: "POST", path: "/api/support/clients/:clientId/seed-rules", label: "Seed default workflow rules" },
      { method: "GET", path: "/api/support/clients/:clientId/reports", label: "List monthly reports" },
      { method: "POST", path: "/api/support/clients/:clientId/reports", label: "Generate monthly report" },
      { method: "GET", path: "/api/support/dashboard", label: "Care overview (cross-client)" },
      { method: "GET", path: "/api/support/discord/channels", label: "Discord channel picker" },
    ],
  },
  {
    name: "Integrations",
    description: "User-scoped Google + Slack + meeting summary.",
    endpoints: [
      { method: "GET", path: "/api/integrations/calendar", label: "Upcoming calendar events (current user)" },
      { method: "GET", path: "/api/integrations/gmail", label: "Recent inbox (current user)" },
      { method: "GET", path: "/api/integrations/gmail/connect", label: "Start Gmail OAuth" },
      { method: "POST", path: "/api/integrations/gmail/disconnect", label: "Disconnect current user's Gmail" },
      { method: "POST", path: "/api/integrations/meeting-summary", label: "Summarise calendar meeting (cached)" },
      { method: "GET", path: "/api/integrations/slack/channels", label: "List bot-visible Slack channels" },
    ],
  },
  {
    name: "Proof",
    description: "Brief intake + signed-off documents.",
    endpoints: [
      { method: "POST", path: "/api/proof/analyse", label: "Parse a brief into structured fields (cached)" },
      { method: "GET", path: "/api/proof/documents", label: "List proof documents" },
      { method: "POST", path: "/api/proof/documents", label: "Create proof document" },
      { method: "GET", path: "/api/proof/documents/:id", label: "Get proof document" },
      { method: "PATCH", path: "/api/proof/documents/:id", label: "Update proof document" },
      { method: "GET", path: "/api/proof/health", label: "Proof workspace health" },
    ],
  },
  {
    name: "Rate card",
    description: "Workspace people and their day rates (used in proposal costing).",
    endpoints: [
      { method: "GET", path: "/api/rate-card/people", label: "List people + rates" },
      { method: "POST", path: "/api/rate-card/people", label: "Create rate-card person" },
      { method: "GET", path: "/api/rate-card/people/:id", label: "Get rate-card person" },
      { method: "PATCH", path: "/api/rate-card/people/:id", label: "Update rate-card person" },
      { method: "DELETE", path: "/api/rate-card/people/:id", label: "Archive rate-card person" },
    ],
  },
  {
    name: "Mobile + devices",
    description: "iOS authentication and push device registration.",
    endpoints: [
      { method: "POST", path: "/api/auth/mobile-callback", label: "Issue mobile JWT from Google id_token" },
      { method: "POST", path: "/api/devices/register", label: "Register an APNs device token" },
      { method: "GET", path: "/api/devices/me", label: "List current user's devices" },
    ],
  },
];

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
  const [filter, setFilter] = useState("");

  function copy(text: string, setCopied: (value: boolean) => void) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const needle = filter.trim().toLowerCase();
  const filteredGroups = needle
    ? API_GROUPS.map((group) => ({
        ...group,
        endpoints: group.endpoints.filter(
          (e) =>
            e.path.toLowerCase().includes(needle) ||
            e.label.toLowerCase().includes(needle) ||
            e.method.toLowerCase().includes(needle),
        ),
      })).filter((g) => g.endpoints.length > 0)
    : API_GROUPS;
  const totalEndpoints = filteredGroups.reduce((sum, g) => sum + g.endpoints.length, 0);

  return (
    <SettingsCard
      number="03"
      title="API access"
      right={
        <Link
          href="/api-docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-1)] shadow-[var(--shadow-xs)] transition hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]"
        >
          View full API docs
          <ArrowTopRightOnSquareIcon className="h-4 w-4 text-[var(--text-4)]" />
        </Link>
      }
    >
      <p className="max-w-3xl text-sm leading-6 text-[var(--text-3)]">
        Use these endpoints to connect Foundry to external clients (the iOS app, automation
        scripts, partner integrations). The web app authenticates via a server-set session
        cookie; external clients send{" "}
        <code className="rounded bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-2)]">
          Authorization: Bearer &lt;API_KEY&gt;
        </code>
        .
      </p>

      {/* Base URL + Authentication — stacked vertically so the endpoint list below has full
          width. The previous side-by-side layout cramped both halves. */}
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
          <FieldLabel>API authentication</FieldLabel>
          {apiKeyConfigured ? (
            <p className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-2)]">
              Server key configured. Manage the bearer token from Vercel project settings — never
              expose it in the browser.
            </p>
          ) : (
            <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-3 py-2.5 text-sm text-[var(--text-4)]">
              No API key configured. Set <code className="font-mono">API_KEY</code> in your
              environment variables.
            </p>
          )}
        </div>
      </div>

      {/* Endpoints — full-width below the auth info, grouped by module. */}
      <div className="mt-8 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <FieldLabel>Endpoints</FieldLabel>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by method, path, or label…"
            className="w-full max-w-xs rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-sm"
          />
        </div>

        {filteredGroups.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-sm text-[var(--text-4)]">
            Nothing matches &ldquo;{filter}&rdquo;.
          </p>
        ) : (
          <>
            <p className="text-[11px] text-[var(--text-4)]">
              {totalEndpoints} endpoint{totalEndpoints === 1 ? "" : "s"} across {filteredGroups.length} module
              {filteredGroups.length === 1 ? "" : "s"}. Each requires{" "}
              <code className="font-mono">Authorization: Bearer &lt;API_KEY&gt;</code> unless
              marked public.
            </p>
            <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
              {filteredGroups.map((group, gIdx) => (
                <div
                  key={group.name}
                  className={cn(
                    "bg-white",
                    gIdx > 0 && "border-t border-[var(--border-2)]",
                  )}
                >
                  <div className="border-b border-[var(--border-3)] bg-[var(--surface-1)] px-4 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-2)]">
                      {group.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-4)]">{group.description}</p>
                  </div>
                  <ul className="divide-y divide-[var(--border-3)]">
                    {group.endpoints.map((endpoint) => (
                      <li
                        key={`${endpoint.method}-${endpoint.path}`}
                        className="grid grid-cols-[60px_minmax(0,1fr)] items-baseline gap-3 px-4 py-2 text-xs sm:grid-cols-[60px_minmax(0,420px)_minmax(0,1fr)]"
                      >
                        <span
                          className={cn(
                            "shrink-0 font-mono font-semibold",
                            methodColor(endpoint.method),
                          )}
                        >
                          {endpoint.method}
                        </span>
                        <code className="truncate font-mono text-[var(--text-1)]">
                          {endpoint.path}
                        </code>
                        <span className="hidden text-[var(--text-3)] sm:block sm:truncate">
                          {endpoint.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </SettingsCard>
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        placeholder={placeholder}
        // `app-input` provides the border + 36px height + focus ring. Without it the input has
        // zero affordance — looks like plain text on the page.
        className="app-input"
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
      <SettingsCard
        number="01"
        title="Document templates"
        right={`${templates.length} total`}
        bodyClassName="space-y-5"
      >
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
      </SettingsCard>
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
    <SettingsCard
      number="05"
      title="Doc notifications · Slack"
      right={`${subs?.length ?? 0} configured`}
      bodyClassName="space-y-5"
    >
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
    </SettingsCard>
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
    <SettingsCard
      number="06"
      title="Branded share domain"
      right={state?.verified ? "VERIFIED" : state?.hostname ? "PENDING" : "DEFAULT"}
      bodyClassName="space-y-5"
    >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Replace <code className="font-mono text-[12px] text-[var(--text-2)]">foundry.gitwork.co.uk/docs/&hellip;</code>{" "}
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
    </SettingsCard>
  );
}
