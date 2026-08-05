/**
 * Editors for SLA / contract sections (Sprint 3 of the Docs rebuild).
 *
 * Each editor takes its section's data + an `onChange` callback that emits the next data shape.
 * Editors operate in-memory only; the parent (section-editor → proposal-builder-panel →
 * proposal-editor-layout) drives autosave by serialising the whole proposal back to the API.
 *
 * LAYOUT CONTRACT (important): these editors render inside the ~300–360px Options rail, NOT a wide
 * canvas. So each repeatable item is an <ItemCard>: a `@container` with the move/delete controls in
 * a header row (never beside the fields, where they used to overlap) and fields that stack in one
 * column by default, going two-up only when the rail itself is genuinely wide (`@[26rem]:`). Never
 * use viewport breakpoints (`sm:`/`md:`) for the field grid here — they fire on the window width,
 * not the rail's, and re-introduce the overlap.
 */

"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  EmptyHint,
  FieldLabel,
  ItemCard,
  editorId as id,
  makeMover,
} from "@/components/proposals/editor-primitives";
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
} from "@/types/proposal";

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
          placeholder="e.g. This agreement is dated 4 August 2026 and is made between:"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="app-eyebrow min-w-0">Parties</p>
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
            <ItemCard
              key={party.id}
              label={party.name || `Party ${index + 1}`}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onDelete={() => onChange({ ...data, parties: parties.filter((_, i) => i !== index) })}
              ariaLabel={`party ${party.name || index + 1}`}
            >
              <div className="grid gap-3 @[26rem]:grid-cols-2">
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
                {/* Spans the rail so the field grid stays gapless with an odd field count. */}
                <label className="space-y-1.5 @[26rem]:col-span-2">
                  <FieldLabel>Referred to as (optional)</FieldLabel>
                  <input
                    value={party.definedTerm ?? ""}
                    onChange={(e) => patch(index, { definedTerm: e.target.value })}
                    className="app-input-compact"
                    placeholder="Gitwork"
                  />
                  <span className="block text-xs leading-5 text-[var(--text-4)]">
                    Quoted at the end of the clause. Defaults to the role (&ldquo;the Client&rdquo;),
                    else the name without Ltd / Group.
                  </span>
                </label>
                {/* Full-width: detail lines are clause fragments, so they need the whole rail. */}
                <label className="space-y-1.5 @[26rem]:col-span-2">
                  <FieldLabel>Details — one per line (optional)</FieldLabel>
                  {/* Stored as the raw split lines (blanks included) so a newline you just typed
                      isn't swallowed by the controlled value; the render drops blank lines. */}
                  <textarea
                    value={(party.details ?? []).join("\n")}
                    onChange={(e) => patch(index, { details: e.target.value.split("\n") })}
                    className="app-textarea"
                    rows={3}
                    placeholder={
                      "a company registered in England and Wales under number 15756347\nwhose registered office is at 3rd Floor, Anchorage One, Salford Quays, M50 3YJ"
                    }
                  />
                  <span className="block text-xs leading-5 text-[var(--text-4)]">
                    Joined into the party&rsquo;s clause: <em>Name</em>, detail, detail
                    (&ldquo;term&rdquo;). Leave blank to keep using Organisation / Email.
                  </span>
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
                <label className="flex items-center gap-2 text-sm text-[var(--text-2)] @[26rem]:col-span-2">
                  <input
                    type="checkbox"
                    checked={party.signatureRequired}
                    onChange={(e) => patch(index, { signatureRequired: e.target.checked })}
                    className="app-checkbox"
                  />
                  Signature required on this document
                </label>
              </div>
            </ItemCard>
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="app-eyebrow min-w-0">Tiers</p>
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
            <ItemCard
              key={tier.id}
              label={tier.name || `Tier ${index + 1}`}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onDelete={() => onChange({ ...data, tiers: tiers.filter((_, i) => i !== index) })}
              ariaLabel={`tier ${tier.name || index + 1}`}
            >
              <div className="grid gap-3 @[26rem]:grid-cols-2">
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
                <label className="space-y-1.5 @[26rem]:col-span-2">
                  <FieldLabel>Services included</FieldLabel>
                  <textarea
                    value={tier.services}
                    onChange={(e) => patch(index, { services: e.target.value })}
                    className="proposal-field-compact"
                    placeholder="Hosting, monitoring, weekly dependency updates, business-hours support."
                  />
                </label>
                <label className="space-y-1.5 @[26rem]:col-span-2">
                  <FieldLabel>Support hours</FieldLabel>
                  <input
                    value={tier.supportHours}
                    onChange={(e) => patch(index, { supportHours: e.target.value })}
                    className="app-input-compact"
                    placeholder="Mon–Fri 09:00–18:00 UK"
                  />
                </label>
              </div>
            </ItemCard>
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="app-eyebrow min-w-0">Priority levels</p>
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
            <ItemCard
              key={item.id}
              label={item.priority || `Priority ${index + 1}`}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onDelete={() =>
                onChange({ ...data, priorities: priorities.filter((_, i) => i !== index) })
              }
              ariaLabel={`priority ${item.priority || index + 1}`}
            >
              <div className="grid gap-3 @[26rem]:grid-cols-2">
                <label className="space-y-1.5 @[26rem]:col-span-2">
                  <FieldLabel>Priority label</FieldLabel>
                  <input
                    value={item.priority}
                    onChange={(e) => patch(index, { priority: e.target.value })}
                    className="app-input-compact"
                    placeholder="P1 – Critical"
                  />
                </label>
                <label className="space-y-1.5 @[26rem]:col-span-2">
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
            </ItemCard>
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="app-eyebrow min-w-0">Escalation ladder</p>
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
            <ItemCard
              key={item.id}
              label={`Level ${item.level}`}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onDelete={() => onChange({ ...data, levels: levels.filter((_, i) => i !== index) })}
              ariaLabel={`level ${item.level}`}
            >
              <div className="grid gap-3 @[26rem]:grid-cols-2">
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
            </ItemCard>
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="app-eyebrow min-w-0">Exclusions</p>
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
            <ItemCard
              key={item.id}
              label={item.exclusion || `Exclusion ${index + 1}`}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onDelete={() => onChange({ ...data, items: items.filter((_, i) => i !== index) })}
              ariaLabel={`exclusion ${index + 1}`}
            >
              <div className="grid gap-3">
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
            </ItemCard>
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="app-eyebrow min-w-0">Service credit tiers</p>
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
            <ItemCard
              key={item.id}
              label={item.trigger || `Credit tier ${index + 1}`}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onDelete={() => onChange({ ...data, tiers: tiers.filter((_, i) => i !== index) })}
              ariaLabel={`credit tier ${index + 1}`}
            >
              <div className="grid gap-3">
                <label className="space-y-1.5">
                  <FieldLabel>Trigger</FieldLabel>
                  <input
                    value={item.trigger}
                    onChange={(e) => patch(index, { trigger: e.target.value })}
                    className="app-input-compact"
                    placeholder="Uptime falls below 99.0%"
                  />
                </label>
                <div className="grid gap-3 @[26rem]:grid-cols-2">
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
            </ItemCard>
          ))}
        </div>
      ) : (
        <EmptyHint>Add at least one credit tier.</EmptyHint>
      )}
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
      {/* One-line reminder that these are layout blocks; signing itself runs from the Signatures
          tab. Kept compact on purpose — it used to be a paragraph that buried the actual editor. */}
      <p className="text-xs leading-5 text-[var(--text-3)]">
        These blocks show <strong className="font-semibold text-[var(--text-2)]">who signs</strong> on
        the document. To collect signatures, open the <strong className="font-semibold text-[var(--text-2)]">Signatures</strong> tab
        and choose <em>Send for signature</em>.
      </p>

      <div className="space-y-2">
        <FieldLabel>Introduction</FieldLabel>
        <textarea
          value={data.intro ?? ""}
          onChange={(e) => onChange({ ...data, intro: e.target.value })}
          className="app-textarea"
          placeholder="Signed for and on behalf of:"
        />
      </div>

      <div className="space-y-2">
        <FieldLabel>Note on signing (optional)</FieldLabel>
        <textarea
          value={data.note ?? ""}
          onChange={(e) => onChange({ ...data, note: e.target.value })}
          className="app-textarea"
          rows={3}
          placeholder="e.g. This Agreement may be executed in counterparts, each of which is an original."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="app-eyebrow min-w-0">Signature blocks</p>
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
            <ItemCard
              key={block.id}
              label={block.partyName || block.signatoryName || `Signatory ${index + 1}`}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onDelete={() => onChange({ ...data, blocks: blocks.filter((_, i) => i !== index) })}
              ariaLabel={`signature block ${index + 1}`}
            >
              <div className="grid gap-3 @[26rem]:grid-cols-2">
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
                <label className="space-y-1.5 @[26rem]:col-span-2">
                  <FieldLabel>Details — one per line (optional)</FieldLabel>
                  {/* Stored as the raw split lines (blanks included) so a newline you just typed
                      isn't swallowed by the controlled value; the preview drops blank lines. */}
                  <textarea
                    value={(block.details ?? []).join("\n")}
                    onChange={(e) => patch(index, { details: e.target.value.split("\n") })}
                    className="app-textarea"
                    rows={3}
                    placeholder={"Company no. 12345678\nRegistered in England and Wales"}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-2)] @[26rem]:col-span-2">
                  <input
                    type="checkbox"
                    checked={block.personal ?? false}
                    onChange={(e) => patch(index, { personal: e.target.checked })}
                    className="app-checkbox"
                  />
                  Individual (signs personally)
                </label>
              </div>
            </ItemCard>
          ))}
        </div>
      ) : (
        <EmptyHint>Add a signature block per signatory.</EmptyHint>
      )}
    </div>
  );
}
