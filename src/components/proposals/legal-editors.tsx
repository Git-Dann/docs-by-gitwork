/**
 * Editors for SLA / contract sections (Sprint 3 of the Docs rebuild).
 *
 * Each editor takes its section's data + an `onChange` callback that emits the next data shape.
 * Editors operate in-memory only; the parent (section-editor → proposal-builder-panel →
 * proposal-editor-layout) drives autosave by serialising the whole proposal back to the API.
 *
 * Visual pattern follows the existing proposal editors (objectives-editor, list-items-editor):
 * a wrapper panel + per-row card with move-up/down/delete + a single "Add" button.
 */

"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type {
  EscalationLevelItem,
  EscalationSectionData,
  ExclusionItem,
  ExclusionsSectionData,
  PartiesSectionData,
  PartyItem,
  PenaltyTierItem,
  PenaltiesSectionData,
  ResponsePriorityItem,
  ResponseTimesSectionData,
  ServiceTierItem,
  ServiceTiersSectionData,
  SignaturesSectionData,
  SignatureBlockItem,
  TermSectionData,
} from "@/types/proposal";

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Generic helpers ─────────────────────────────────────────────────────────

function MoveDeleteControls({
  onMoveUp,
  onMoveDown,
  onDelete,
  ariaLabel,
}: {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-start gap-1.5">
      <Button
        type="button"
        onClick={onMoveUp}
        variant="secondary"
        size="icon-md"
        aria-label={`Move ${ariaLabel} up`}
      >
        <ArrowUpIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        onClick={onMoveDown}
        variant="secondary"
        size="icon-md"
        aria-label={`Move ${ariaLabel} down`}
      >
        <ArrowDownIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        onClick={onDelete}
        variant="danger"
        size="icon-md"
        aria-label={`Delete ${ariaLabel}`}
      >
        <TrashIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="app-field-label">{children}</span>;
}

function makeMover<T>(items: T[], onChange: (next: T[]) => void) {
  return (index: number, delta: -1 | 1) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const clone = [...items];
    const [entry] = clone.splice(index, 1);
    clone.splice(nextIndex, 0, entry);
    onChange(clone);
  };
}

// ── Parties ─────────────────────────────────────────────────────────────────

export function PartiesEditor({
  data,
  onChange,
}: {
  data: PartiesSectionData;
  onChange: (next: PartiesSectionData) => void;
}) {
  const parties = data.parties ?? [];
  const move = makeMover(parties, (next) => onChange({ ...data, parties: next }));

  function patch(index: number, patch: Partial<PartyItem>) {
    onChange({
      ...data,
      parties: parties.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });
  }

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="space-y-2">
        <FieldLabel>Introduction</FieldLabel>
        <textarea
          value={data.intro ?? ""}
          onChange={(e) => onChange({ ...data, intro: e.target.value })}
          className="app-textarea"
          placeholder="e.g. This Agreement is made between:"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="app-eyebrow">Parties</p>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          onClick={() =>
            onChange({
              ...data,
              parties: [
                ...parties,
                {
                  id: id(),
                  name: "",
                  role: "",
                  organization: "",
                  email: "",
                  signatureRequired: true,
                },
              ],
            })
          }
        >
          Add party
        </Button>
      </div>

      {parties.length ? (
        <div className="space-y-3">
          {parties.map((party, index) => (
            <div
              key={party.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4"
            >
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <FieldLabel>Display name</FieldLabel>
                  <input
                    value={party.name}
                    onChange={(e) => patch(index, { name: e.target.value })}
                    className="app-input-compact"
                    placeholder="Gitwork Ltd"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Role</FieldLabel>
                  <input
                    value={party.role}
                    onChange={(e) => patch(index, { role: e.target.value })}
                    className="app-input-compact"
                    placeholder="Service Provider"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Organisation</FieldLabel>
                  <input
                    value={party.organization}
                    onChange={(e) => patch(index, { organization: e.target.value })}
                    className="app-input-compact"
                    placeholder="Gitwork Ltd"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Email</FieldLabel>
                  <input
                    type="email"
                    value={party.email}
                    onChange={(e) => patch(index, { email: e.target.value })}
                    className="app-input-compact"
                    placeholder="hello@gitwork.io"
                  />
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    checked={party.signatureRequired}
                    onChange={(e) => patch(index, { signatureRequired: e.target.checked })}
                    className="app-checkbox"
                  />
                  Signature required on this document
                </label>
              </div>
              <MoveDeleteControls
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onDelete={() =>
                  onChange({
                    ...data,
                    parties: parties.filter((_, i) => i !== index),
                  })
                }
                ariaLabel={`party ${party.name || index + 1}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>No parties added yet. Add at least two for a valid agreement.</EmptyHint>
      )}
    </div>
  );
}

// ── Service Tiers ───────────────────────────────────────────────────────────

export function ServiceTiersEditor({
  data,
  onChange,
}: {
  data: ServiceTiersSectionData;
  onChange: (next: ServiceTiersSectionData) => void;
}) {
  const tiers = data.tiers ?? [];
  const move = makeMover(tiers, (next) => onChange({ ...data, tiers: next }));

  function patch(index: number, patch: Partial<ServiceTierItem>) {
    onChange({
      ...data,
      tiers: tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    });
  }

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="space-y-2">
        <FieldLabel>Introduction</FieldLabel>
        <textarea
          value={data.intro ?? ""}
          onChange={(e) => onChange({ ...data, intro: e.target.value })}
          className="app-textarea"
          placeholder="Brief description of the services covered by this SLA."
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="app-eyebrow">Tiers</p>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          onClick={() =>
            onChange({
              ...data,
              tiers: [
                ...tiers,
                { id: id(), name: "", services: "", uptimeTarget: "", supportHours: "" },
              ],
            })
          }
        >
          Add tier
        </Button>
      </div>

      {tiers.length ? (
        <div className="space-y-3">
          {tiers.map((tier, index) => (
            <div
              key={tier.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4"
            >
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <FieldLabel>Tier name</FieldLabel>
                  <input
                    value={tier.name}
                    onChange={(e) => patch(index, { name: e.target.value })}
                    className="app-input-compact"
                    placeholder="Standard"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Uptime target</FieldLabel>
                  <input
                    value={tier.uptimeTarget}
                    onChange={(e) => patch(index, { uptimeTarget: e.target.value })}
                    className="app-input-compact"
                    placeholder="99.9%"
                  />
                </label>
                <label className="space-y-1.5 sm:col-span-2">
                  <FieldLabel>Services included</FieldLabel>
                  <textarea
                    value={tier.services}
                    onChange={(e) => patch(index, { services: e.target.value })}
                    className="proposal-field-compact"
                    placeholder="Hosting, monitoring, weekly dependency updates, business-hours support."
                  />
                </label>
                <label className="space-y-1.5 sm:col-span-2">
                  <FieldLabel>Support hours</FieldLabel>
                  <input
                    value={tier.supportHours}
                    onChange={(e) => patch(index, { supportHours: e.target.value })}
                    className="app-input-compact"
                    placeholder="Mon–Fri 09:00–18:00 UK"
                  />
                </label>
              </div>
              <MoveDeleteControls
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onDelete={() =>
                  onChange({ ...data, tiers: tiers.filter((_, i) => i !== index) })
                }
                ariaLabel={`tier ${tier.name || index + 1}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>No tiers yet. Add at least one to describe the service shape.</EmptyHint>
      )}
    </div>
  );
}

// ── Response Times ──────────────────────────────────────────────────────────

export function ResponseTimesEditor({
  data,
  onChange,
}: {
  data: ResponseTimesSectionData;
  onChange: (next: ResponseTimesSectionData) => void;
}) {
  const priorities = data.priorities ?? [];
  const move = makeMover(priorities, (next) => onChange({ ...data, priorities: next }));

  function patch(index: number, patch: Partial<ResponsePriorityItem>) {
    onChange({
      ...data,
      priorities: priorities.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });
  }

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="space-y-2">
        <FieldLabel>Introduction</FieldLabel>
        <textarea
          value={data.intro ?? ""}
          onChange={(e) => onChange({ ...data, intro: e.target.value })}
          className="app-textarea"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="app-eyebrow">Priority levels</p>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          onClick={() =>
            onChange({
              ...data,
              priorities: [
                ...priorities,
                { id: id(), priority: "", definition: "", firstResponse: "", resolution: "" },
              ],
            })
          }
        >
          Add priority
        </Button>
      </div>

      {priorities.length ? (
        <div className="space-y-3">
          {priorities.map((item, index) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4"
            >
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 sm:col-span-2">
                  <FieldLabel>Priority label</FieldLabel>
                  <input
                    value={item.priority}
                    onChange={(e) => patch(index, { priority: e.target.value })}
                    className="app-input-compact"
                    placeholder="P1 – Critical"
                  />
                </label>
                <label className="space-y-1.5 sm:col-span-2">
                  <FieldLabel>Definition</FieldLabel>
                  <textarea
                    value={item.definition}
                    onChange={(e) => patch(index, { definition: e.target.value })}
                    className="proposal-field-compact"
                    placeholder="What qualifies as this priority?"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>First response target</FieldLabel>
                  <input
                    value={item.firstResponse}
                    onChange={(e) => patch(index, { firstResponse: e.target.value })}
                    className="app-input-compact"
                    placeholder="Within 1 business hour"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Resolution target</FieldLabel>
                  <input
                    value={item.resolution}
                    onChange={(e) => patch(index, { resolution: e.target.value })}
                    className="app-input-compact"
                    placeholder="Within 4 business hours"
                  />
                </label>
              </div>
              <MoveDeleteControls
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onDelete={() =>
                  onChange({
                    ...data,
                    priorities: priorities.filter((_, i) => i !== index),
                  })
                }
                ariaLabel={`priority ${item.priority || index + 1}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>Add at least one priority level.</EmptyHint>
      )}
    </div>
  );
}

// ── Escalation ──────────────────────────────────────────────────────────────

export function EscalationEditor({
  data,
  onChange,
}: {
  data: EscalationSectionData;
  onChange: (next: EscalationSectionData) => void;
}) {
  const levels = data.levels ?? [];
  const move = makeMover(levels, (next) => onChange({ ...data, levels: next }));

  function patch(index: number, patch: Partial<EscalationLevelItem>) {
    onChange({
      ...data,
      levels: levels.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    });
  }

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="space-y-2">
        <FieldLabel>Introduction</FieldLabel>
        <textarea
          value={data.intro ?? ""}
          onChange={(e) => onChange({ ...data, intro: e.target.value })}
          className="app-textarea"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="app-eyebrow">Escalation ladder</p>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          onClick={() =>
            onChange({
              ...data,
              levels: [
                ...levels,
                { id: id(), level: levels.length + 1, contact: "", timeframe: "", criteria: "" },
              ],
            })
          }
        >
          Add level
        </Button>
      </div>

      {levels.length ? (
        <div className="space-y-3">
          {levels.map((item, index) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4"
            >
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <FieldLabel>Level</FieldLabel>
                  <input
                    type="number"
                    min={1}
                    value={item.level}
                    onChange={(e) => patch(index, { level: Number(e.target.value) })}
                    className="app-input-compact"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Contact (role + name)</FieldLabel>
                  <input
                    value={item.contact}
                    onChange={(e) => patch(index, { contact: e.target.value })}
                    className="app-input-compact"
                    placeholder="Service Delivery Lead"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>When to escalate</FieldLabel>
                  <input
                    value={item.timeframe}
                    onChange={(e) => patch(index, { timeframe: e.target.value })}
                    className="app-input-compact"
                    placeholder="After 1 business day without progress"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Action required</FieldLabel>
                  <input
                    value={item.criteria}
                    onChange={(e) => patch(index, { criteria: e.target.value })}
                    className="app-input-compact"
                    placeholder="Written status update + corrective action plan"
                  />
                </label>
              </div>
              <MoveDeleteControls
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onDelete={() =>
                  onChange({ ...data, levels: levels.filter((_, i) => i !== index) })
                }
                ariaLabel={`level ${item.level}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>Add at least one escalation level.</EmptyHint>
      )}
    </div>
  );
}

// ── Exclusions ──────────────────────────────────────────────────────────────

export function ExclusionsEditor({
  data,
  onChange,
}: {
  data: ExclusionsSectionData;
  onChange: (next: ExclusionsSectionData) => void;
}) {
  const items = data.items ?? [];
  const move = makeMover(items, (next) => onChange({ ...data, items: next }));

  function patch(index: number, patch: Partial<ExclusionItem>) {
    onChange({
      ...data,
      items: items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    });
  }

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="space-y-2">
        <FieldLabel>Introduction</FieldLabel>
        <textarea
          value={data.intro ?? ""}
          onChange={(e) => onChange({ ...data, intro: e.target.value })}
          className="app-textarea"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="app-eyebrow">Exclusions</p>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          onClick={() =>
            onChange({
              ...data,
              items: [...items, { id: id(), exclusion: "", rationale: "" }],
            })
          }
        >
          Add exclusion
        </Button>
      </div>

      {items.length ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4"
            >
              <div className="grid flex-1 gap-3">
                <label className="space-y-1.5">
                  <FieldLabel>Exclusion</FieldLabel>
                  <input
                    value={item.exclusion}
                    onChange={(e) => patch(index, { exclusion: e.target.value })}
                    className="app-input-compact"
                    placeholder="Scheduled maintenance windows"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Rationale</FieldLabel>
                  <textarea
                    value={item.rationale}
                    onChange={(e) => patch(index, { rationale: e.target.value })}
                    className="proposal-field-compact"
                  />
                </label>
              </div>
              <MoveDeleteControls
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onDelete={() =>
                  onChange({ ...data, items: items.filter((_, i) => i !== index) })
                }
                ariaLabel={`exclusion ${index + 1}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>Add at least one exclusion.</EmptyHint>
      )}
    </div>
  );
}

// ── Penalties ───────────────────────────────────────────────────────────────

export function PenaltiesEditor({
  data,
  onChange,
}: {
  data: PenaltiesSectionData;
  onChange: (next: PenaltiesSectionData) => void;
}) {
  const tiers = data.tiers ?? [];
  const move = makeMover(tiers, (next) => onChange({ ...data, tiers: next }));

  function patch(index: number, patch: Partial<PenaltyTierItem>) {
    onChange({
      ...data,
      tiers: tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    });
  }

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="space-y-2">
        <FieldLabel>Introduction</FieldLabel>
        <textarea
          value={data.intro ?? ""}
          onChange={(e) => onChange({ ...data, intro: e.target.value })}
          className="app-textarea"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="app-eyebrow">Service credit tiers</p>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          onClick={() =>
            onChange({
              ...data,
              tiers: [...tiers, { id: id(), trigger: "", credit: "", cap: "" }],
            })
          }
        >
          Add tier
        </Button>
      </div>

      {tiers.length ? (
        <div className="space-y-3">
          {tiers.map((item, index) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4"
            >
              <div className="grid flex-1 gap-3">
                <label className="space-y-1.5">
                  <FieldLabel>Trigger</FieldLabel>
                  <input
                    value={item.trigger}
                    onChange={(e) => patch(index, { trigger: e.target.value })}
                    className="app-input-compact"
                    placeholder="Uptime falls below 99.0%"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <FieldLabel>Service credit</FieldLabel>
                    <input
                      value={item.credit}
                      onChange={(e) => patch(index, { credit: e.target.value })}
                      className="app-input-compact"
                      placeholder="10% of monthly fee"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <FieldLabel>Cap (optional)</FieldLabel>
                    <input
                      value={item.cap}
                      onChange={(e) => patch(index, { cap: e.target.value })}
                      className="app-input-compact"
                      placeholder="Capped at 100% per 12 months"
                    />
                  </label>
                </div>
              </div>
              <MoveDeleteControls
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onDelete={() =>
                  onChange({ ...data, tiers: tiers.filter((_, i) => i !== index) })
                }
                ariaLabel={`credit tier ${index + 1}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>Add at least one credit tier.</EmptyHint>
      )}
    </div>
  );
}

// ── Term ────────────────────────────────────────────────────────────────────

export function TermEditor({
  data,
  onChange,
}: {
  data: TermSectionData;
  onChange: (next: TermSectionData) => void;
}) {
  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <FieldLabel>Effective date</FieldLabel>
          <input
            type="date"
            value={data.effectiveDate ?? ""}
            onChange={(e) => onChange({ ...data, effectiveDate: e.target.value })}
            className="app-input-compact"
          />
        </label>
        <label className="space-y-1.5">
          <FieldLabel>Initial term (months)</FieldLabel>
          <input
            type="number"
            min={1}
            value={data.initialTermMonths ?? 12}
            onChange={(e) => onChange({ ...data, initialTermMonths: Number(e.target.value) })}
            className="app-input-compact"
          />
        </label>
        <label className="space-y-1.5">
          <FieldLabel>Notice period (days)</FieldLabel>
          <input
            type="number"
            min={0}
            value={data.noticePeriodDays ?? 60}
            onChange={(e) => onChange({ ...data, noticePeriodDays: Number(e.target.value) })}
            className="app-input-compact"
          />
        </label>
        <label className="space-y-1.5">
          <FieldLabel>Governing law</FieldLabel>
          <input
            value={data.governingLaw ?? ""}
            onChange={(e) => onChange({ ...data, governingLaw: e.target.value })}
            className="app-input-compact"
            placeholder="England and Wales"
          />
        </label>
        <label className="col-span-full flex items-center gap-2 text-sm text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={data.autoRenew ?? false}
            onChange={(e) => onChange({ ...data, autoRenew: e.target.checked })}
            className="app-checkbox"
          />
          Auto-renew at end of initial term
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <FieldLabel>Renewal term description</FieldLabel>
          <input
            value={data.renewalTerm ?? ""}
            onChange={(e) => onChange({ ...data, renewalTerm: e.target.value })}
            className="app-input-compact"
            placeholder="Successive 12-month periods"
          />
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <FieldLabel>Termination for cause</FieldLabel>
          <textarea
            value={data.terminationForCause ?? ""}
            onChange={(e) => onChange({ ...data, terminationForCause: e.target.value })}
            className="proposal-field-compact"
          />
        </label>
      </div>
    </div>
  );
}

// ── Signatures ──────────────────────────────────────────────────────────────

export function SignaturesEditor({
  data,
  onChange,
}: {
  data: SignaturesSectionData;
  onChange: (next: SignaturesSectionData) => void;
}) {
  const blocks = data.blocks ?? [];
  const move = makeMover(blocks, (next) => onChange({ ...data, blocks: next }));

  function patch(index: number, patch: Partial<SignatureBlockItem>) {
    onChange({
      ...data,
      blocks: blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    });
  }

  return (
    <div className="app-subtle-panel space-y-4 p-5">
      <div className="space-y-2">
        <FieldLabel>Introduction</FieldLabel>
        <textarea
          value={data.intro ?? ""}
          onChange={(e) => onChange({ ...data, intro: e.target.value })}
          className="app-textarea"
          placeholder="Signed for and on behalf of:"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="app-eyebrow">Signature blocks</p>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          onClick={() =>
            onChange({
              ...data,
              blocks: [
                ...blocks,
                {
                  id: id(),
                  partyName: "",
                  signatoryName: "",
                  signatoryRole: "",
                  signatoryEmail: "",
                  signatureDate: "",
                },
              ],
            })
          }
        >
          Add signatory
        </Button>
      </div>

      {blocks.length ? (
        <div className="space-y-3">
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4"
            >
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <FieldLabel>Party</FieldLabel>
                  <input
                    value={block.partyName}
                    onChange={(e) => patch(index, { partyName: e.target.value })}
                    className="app-input-compact"
                    placeholder="Gitwork Ltd"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Signatory name</FieldLabel>
                  <input
                    value={block.signatoryName}
                    onChange={(e) => patch(index, { signatoryName: e.target.value })}
                    className="app-input-compact"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Signatory role</FieldLabel>
                  <input
                    value={block.signatoryRole}
                    onChange={(e) => patch(index, { signatoryRole: e.target.value })}
                    className="app-input-compact"
                    placeholder="Director"
                  />
                </label>
                <label className="space-y-1.5">
                  <FieldLabel>Signatory email</FieldLabel>
                  <input
                    type="email"
                    value={block.signatoryEmail}
                    onChange={(e) => patch(index, { signatoryEmail: e.target.value })}
                    className="app-input-compact"
                  />
                </label>
              </div>
              <MoveDeleteControls
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onDelete={() =>
                  onChange({ ...data, blocks: blocks.filter((_, i) => i !== index) })
                }
                ariaLabel={`signature block ${index + 1}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>Add a signature block per signatory.</EmptyHint>
      )}
    </div>
  );
}

// ── Shared empty hint ───────────────────────────────────────────────────────

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
      {children}
    </p>
  );
}
