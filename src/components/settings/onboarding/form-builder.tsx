"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeftIcon,
  Bars2Icon,
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { fieldIdSet, isFieldVisible } from "@/lib/onboarding/structure";
import { fieldTypeMeta } from "@/lib/onboarding/field-types";
import { RECOMMENDED_REQUIRED_KEYS } from "@/lib/onboarding/system-fields";
import { useOnboardingForm, useUpdateOnboardingForm } from "@/hooks/use-onboarding-forms";
import { FieldRenderer, type BankInput, type BankSummary } from "@/components/onboarding/field-renderer";
import { AddFieldPalette } from "@/components/settings/onboarding/add-field-palette";
import type {
  OnboardingAnswers,
  OnboardingAnswerValue,
  OnboardingFieldDef,
  OnboardingFormStructure,
  OnboardingStepDef,
} from "@/types/onboarding";

const WIDTH_TYPES = new Set(["short_text", "email", "phone", "url", "number", "select"]);
const REQUIRABLE = new Set(["short_text", "long_text", "email", "phone", "url", "number", "select", "multiselect", "checkbox"]);
const RECOMMENDED = new Set(RECOMMENDED_REQUIRED_KEYS);

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

type Selection = { kind: "welcome" } | { kind: "review" } | { kind: "step"; id: string };

export function OnboardingFormBuilder({ formId, onBack }: { formId: string; onBack: () => void }) {
  const { data, isPending } = useOnboardingForm(formId);
  const update = useUpdateOnboardingForm();

  const [structure, setStructure] = useState<OnboardingFormStructure | null>(null);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [sel, setSel] = useState<Selection>({ kind: "welcome" });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<OnboardingAnswers>({});
  const loadedRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  // Initialise local state once when the form loads (don't clobber edits on refetch).
  useEffect(() => {
    if (data?.form && loadedRef.current !== data.form.id) {
      loadedRef.current = data.form.id;
      setStructure(data.form.structure);
      setName(data.form.name);
      setIsDefault(data.form.isDefault);
      if (data.form.structure.steps[0]) setSel({ kind: "step", id: data.form.structure.steps[0].id });
    }
  }, [data]);

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const commitStructure = useCallback(
    (next: OnboardingFormStructure) => {
      setStructure(next);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        update.mutate({ id: formId, structure: next });
      }, 700);
    },
    [formId, update],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isPending || !structure) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[var(--text-4)]">
        Loading form…
      </div>
    );
  }

  const steps = structure.steps;
  const selStep = sel.kind === "step" ? steps.find((s) => s.id === sel.id) ?? null : null;
  const usedSystemKeys = new Set(
    steps.flatMap((s) => s.fields.map((f) => f.systemKey).filter((k): k is string => Boolean(k))),
  );

  // ── Structure mutators ──────────────────────────────────────────────
  const setSteps = (next: OnboardingStepDef[]) => commitStructure({ ...structure, steps: next });

  const addStep = () => {
    const id = newId("step");
    const step: OnboardingStepDef = { id, key: id, title: "New step", fields: [] };
    commitStructure({ ...structure, steps: [...steps, step] });
    setSel({ kind: "step", id });
  };
  const updateStep = (id: string, patch: Partial<OnboardingStepDef>) =>
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const deleteStep = (id: string) => {
    setSteps(steps.filter((s) => s.id !== id));
    if (sel.kind === "step" && sel.id === id) setSel({ kind: "welcome" });
  };

  const addField = (stepId: string, field: OnboardingFieldDef) =>
    setSteps(steps.map((s) => (s.id === stepId ? { ...s, fields: [...s.fields, field] } : s)));
  const updateField = (stepId: string, fieldId: string, patch: Partial<OnboardingFieldDef>) =>
    setSteps(
      steps.map((s) =>
        s.id === stepId
          ? { ...s, fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) }
          : s,
      ),
    );
  const deleteField = (stepId: string, fieldId: string) =>
    setSteps(steps.map((s) => (s.id === stepId ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) } : s)));

  const onStepsDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = steps.findIndex((s) => s.id === active.id);
    const to = steps.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    setSteps(arrayMove(steps, from, to));
  };
  const onFieldsDragEnd = (stepId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const step = steps.find((s) => s.id === stepId);
    if (!step) return;
    const from = step.fields.findIndex((f) => f.id === active.id);
    const to = step.fields.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    updateStep(stepId, { fields: arrayMove(step.fields, from, to) });
  };

  const setPreviewAnswer = (id: string, value: OnboardingAnswerValue) =>
    setPreviewAnswers((prev) => ({ ...prev, [id]: value }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="app-button app-button-tertiary app-button-sm"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All forms
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== data?.form.name && update.mutate({ id: formId, name: name.trim() })}
            className="app-input max-w-xs text-sm font-semibold"
            placeholder="Form name"
          />
          {isDefault ? (
            <span className="rounded-full bg-[var(--brand-200)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand-800)]">
              Default
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsDefault(true);
                update.mutate({ id: formId, isDefault: true });
              }}
              className="text-xs text-[var(--brand-700)] hover:underline"
            >
              Make default
            </button>
          )}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]">
          {update.isPending ? "Saving…" : "Saved ✓"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ── Outline ── */}
        <aside className="lg:col-span-3">
          <div className="space-y-1">
            <OutlineItem label="Welcome" active={sel.kind === "welcome"} onClick={() => setSel({ kind: "welcome" })} />
            <p className="px-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
              Steps
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStepsDragEnd}>
              <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {steps.map((step, i) => (
                    <SortableStepRow
                      key={step.id}
                      step={step}
                      index={i + 1}
                      active={sel.kind === "step" && sel.id === step.id}
                      onSelect={() => setSel({ kind: "step", id: step.id })}
                      onDelete={() => deleteStep(step.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <button
              type="button"
              onClick={addStep}
              className="mt-1 flex w-full items-center gap-2 rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-2 text-xs font-medium text-[var(--text-3)] transition hover:border-[var(--brand-300)] hover:text-[var(--brand-700)]"
            >
              <PlusIcon className="h-4 w-4" />
              Add step
            </button>
            <div className="pt-2">
              <OutlineItem label="Review & submit" active={sel.kind === "review"} onClick={() => setSel({ kind: "review" })} />
            </div>
          </div>
        </aside>

        {/* ── Editor ── */}
        <div className="lg:col-span-5">
          <section className="widget-card">
            <div className="widget-body space-y-4">
              {sel.kind === "welcome" && (
                <WelcomeEditor structure={structure} onChange={(welcome) => commitStructure({ ...structure, welcome })} />
              )}
              {sel.kind === "review" && (
                <ReviewEditor structure={structure} onChange={(review) => commitStructure({ ...structure, review })} />
              )}
              {selStep && (
                <StepEditor
                  step={selStep}
                  sensors={sensors}
                  onStepChange={(patch) => updateStep(selStep.id, patch)}
                  onFieldChange={(fieldId, patch) => updateField(selStep.id, fieldId, patch)}
                  onFieldDelete={(fieldId) => deleteField(selStep.id, fieldId)}
                  onFieldsDragEnd={onFieldsDragEnd(selStep.id)}
                  onAddField={() => setPaletteOpen(true)}
                />
              )}
            </div>
          </section>
        </div>

        {/* ── Live preview ── */}
        <div className="lg:col-span-4">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
            Preview
          </p>
          <section className="widget-card">
            <div className="widget-body space-y-4">
              <StepPreview
                structure={structure}
                selStep={selStep}
                sel={sel}
                answers={previewAnswers}
                setAnswer={setPreviewAnswer}
              />
            </div>
          </section>
        </div>
      </div>

      {paletteOpen && selStep && (
        <AddFieldPalette
          open
          usedSystemKeys={usedSystemKeys}
          onClose={() => setPaletteOpen(false)}
          onPick={(field) => addField(selStep.id, field)}
        />
      )}
    </div>
  );
}

// ─── Outline rows ───────────────────────────────────────────────────────────────

function OutlineItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[8px] px-3 py-2 text-left text-sm font-medium transition",
        active ? "bg-[var(--brand-200)] text-[var(--brand-800)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      {label}
    </button>
  );
}

function SortableStepRow({
  step,
  index,
  active,
  onSelect,
  onDelete,
}: {
  step: OnboardingStepDef;
  index: number;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 transition",
        active ? "bg-[var(--brand-200)]" : "hover:bg-[var(--surface-1)]",
        isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        className="cursor-grab text-[var(--text-4)] hover:text-[var(--text-2)] active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <Bars2Icon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-sm",
          active ? "font-semibold text-[var(--brand-800)]" : "text-[var(--text-2)]",
        )}
      >
        <span className="font-mono text-[10px] text-[var(--text-4)]">{index < 10 ? `0${index}` : index} </span>
        {step.title || "Untitled"}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-[var(--text-4)] opacity-0 transition hover:text-[var(--danger-500)] group-hover:opacity-100"
        aria-label="Delete step"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Welcome / Review editors ─────────────────────────────────────────────────

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="app-field-label">{label}</span>
      {textarea ? (
        <textarea className="app-textarea text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? 3} />
      ) : (
        <input className="app-input text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

function WelcomeEditor({
  structure,
  onChange,
}: {
  structure: OnboardingFormStructure;
  onChange: (welcome: OnboardingFormStructure["welcome"]) => void;
}) {
  const w = structure.welcome;
  const patch = (p: Partial<OnboardingFormStructure["welcome"]>) => onChange({ ...w, ...p });
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-1)]">Welcome screen</h3>
      <LabeledInput label="Eyebrow" value={w.eyebrow ?? ""} onChange={(v) => patch({ eyebrow: v })} placeholder="Onboarding · ~3 mins" />
      <LabeledInput label="Hero heading" value={w.heading} onChange={(v) => patch({ heading: v })} />
      <LabeledInput label="Sub-heading" value={w.subheading ?? ""} onChange={(v) => patch({ subheading: v })} textarea rows={2} />
      <div className="space-y-2">
        <span className="app-field-label">Bullets</span>
        {w.bullets.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="app-input text-sm"
              value={b}
              onChange={(e) => patch({ bullets: w.bullets.map((x, j) => (j === i ? e.target.value : x)) })}
            />
            <button
              type="button"
              onClick={() => patch({ bullets: w.bullets.filter((_, j) => j !== i) })}
              className="text-[var(--text-4)] hover:text-[var(--danger-500)]"
              aria-label="Remove bullet"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
        {w.bullets.length < 8 && (
          <button type="button" onClick={() => patch({ bullets: [...w.bullets, ""] })} className="text-xs text-[var(--brand-700)] hover:underline">
            + Add bullet
          </button>
        )}
      </div>
      <LabeledInput label="Button label" value={w.ctaLabel ?? ""} onChange={(v) => patch({ ctaLabel: v })} placeholder="Get started" />
    </div>
  );
}

function ReviewEditor({
  structure,
  onChange,
}: {
  structure: OnboardingFormStructure;
  onChange: (review: OnboardingFormStructure["review"]) => void;
}) {
  const r = structure.review;
  const patch = (p: Partial<OnboardingFormStructure["review"]>) => onChange({ ...r, ...p });
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-1)]">Review &amp; submit screen</h3>
      <LabeledInput label="Intro line" value={r.blurb ?? ""} onChange={(v) => patch({ blurb: v })} placeholder="Quick check before you send…" />
      <LabeledInput label="Reassurance note" value={r.legal ?? ""} onChange={(v) => patch({ legal: v })} textarea rows={2} />
      <LabeledInput label="Submit fine-print" value={r.agreement ?? ""} onChange={(v) => patch({ agreement: v })} textarea rows={3} />
    </div>
  );
}

// ─── Step editor ────────────────────────────────────────────────────────────────

function StepEditor({
  step,
  sensors,
  onStepChange,
  onFieldChange,
  onFieldDelete,
  onFieldsDragEnd,
  onAddField,
}: {
  step: OnboardingStepDef;
  sensors: ReturnType<typeof useSensors>;
  onStepChange: (patch: Partial<OnboardingStepDef>) => void;
  onFieldChange: (fieldId: string, patch: Partial<OnboardingFieldDef>) => void;
  onFieldDelete: (fieldId: string) => void;
  onFieldsDragEnd: (event: DragEndEvent) => void;
  onAddField: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <LabeledInput label="Step title" value={step.title} onChange={(v) => onStepChange({ title: v })} />
      <LabeledInput label="Intro paragraph" value={step.blurb ?? ""} onChange={(v) => onStepChange({ blurb: v })} textarea rows={2} />

      <div className="space-y-2">
        <span className="app-field-label">Fields</span>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onFieldsDragEnd}>
          <SortableContext items={step.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {step.fields.map((field) => (
                <SortableFieldRow
                  key={field.id}
                  field={field}
                  expanded={expanded === field.id}
                  onToggle={() => setExpanded(expanded === field.id ? null : field.id)}
                  onChange={(patch) => onFieldChange(field.id, patch)}
                  onDelete={() => onFieldDelete(field.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {step.fields.length === 0 && (
          <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-4 text-center text-xs text-[var(--text-4)]">
            No fields yet.
          </p>
        )}
        <button
          type="button"
          onClick={onAddField}
          className="flex w-full items-center gap-2 rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-2 text-xs font-medium text-[var(--text-3)] transition hover:border-[var(--brand-300)] hover:text-[var(--brand-700)]"
        >
          <PlusIcon className="h-4 w-4" />
          Add field
        </button>
      </div>
    </div>
  );
}

function SortableFieldRow({
  field,
  expanded,
  onToggle,
  onChange,
  onDelete,
}: {
  field: OnboardingFieldDef;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<OnboardingFieldDef>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const meta = fieldTypeMeta(field.type);
  const isSystem = Boolean(field.systemKey);
  const isRecommended = field.systemKey ? RECOMMENDED.has(field.systemKey) : false;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-[8px] border border-[var(--border-2)] bg-white", isDragging && "opacity-60")}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          className="cursor-grab text-[var(--text-4)] hover:text-[var(--text-2)] active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <Bars2Icon className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {expanded ? <ChevronDownIcon className="h-3.5 w-3.5 text-[var(--text-4)]" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-[var(--text-4)]" />}
          <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-2)]">{field.label || meta.displayName}</span>
          <span className="rounded-full bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-4)]">
            {isSystem ? "client" : meta.displayName}
          </span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-[var(--text-4)] transition hover:text-[var(--danger-500)]"
          aria-label="Delete field"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-[var(--border-3)] px-3 py-3">
          <FieldEditor field={field} onChange={onChange} />
          {isRecommended && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Recommended field — removing it may leave new client records incomplete.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Field editor ─────────────────────────────────────────────────────────────

function FieldEditor({ field, onChange }: { field: OnboardingFieldDef; onChange: (patch: Partial<OnboardingFieldDef>) => void }) {
  const meta = fieldTypeMeta(field.type);
  const cfg = field.config ?? {};
  const setCfg = (p: Partial<NonNullable<OnboardingFieldDef["config"]>>) => onChange({ config: { ...cfg, ...p } });

  if (field.type === "static") {
    return (
      <div className="space-y-3">
        <LabeledInput label="Heading (optional)" value={field.label} onChange={(v) => onChange({ label: v })} placeholder="Section heading" />
        <LabeledInput label="Body text" value={cfg.body ?? ""} onChange={(v) => setCfg({ body: v })} textarea rows={3} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <LabeledInput label="Label" value={field.label} onChange={(v) => onChange({ label: v })} />
      {field.type === "bank_details" ? (
        <p className="text-[11px] text-[var(--text-4)]">
          Encrypted bank capture. The account/sort-code inputs are built in and can&apos;t be edited.
        </p>
      ) : (
        <>
          <LabeledInput label="Hint (optional)" value={field.hint ?? ""} onChange={(v) => onChange({ hint: v })} />
          {meta.takesInput && (
            <LabeledInput label="Placeholder (optional)" value={field.placeholder ?? ""} onChange={(v) => onChange({ placeholder: v })} />
          )}
          {(field.type === "select" || field.type === "multiselect") && (
            <OptionsEditor field={field} onChange={onChange} />
          )}
          <div className="flex flex-wrap items-center gap-4">
            {REQUIRABLE.has(field.type) && (
              <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                <input
                  type="checkbox"
                  className="app-checkbox"
                  checked={Boolean(field.required)}
                  onChange={(e) => onChange({ required: e.target.checked })}
                />
                Required
              </label>
            )}
            {WIDTH_TYPES.has(field.type) && (
              <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                Width
                <select
                  className="app-input h-8 w-auto text-sm"
                  value={cfg.width ?? "full"}
                  onChange={(e) => setCfg({ width: e.target.value as "full" | "half" })}
                >
                  <option value="full">Full</option>
                  <option value="half">Half</option>
                </select>
              </label>
            )}
          </div>
          {field.systemKey && (
            <p className="font-mono text-[10px] text-[var(--text-4)]">Maps to client field: {field.systemKey}</p>
          )}
        </>
      )}
    </div>
  );
}

function OptionsEditor({ field, onChange }: { field: OnboardingFieldDef; onChange: (patch: Partial<OnboardingFieldDef>) => void }) {
  const options = field.options ?? [];
  const set = (next: typeof options) => onChange({ options: next });
  return (
    <div className="space-y-2">
      <span className="app-field-label">Options</span>
      {options.map((o, i) => (
        <div key={o.id} className="flex items-center gap-2">
          <input
            className="app-input text-sm"
            value={o.label}
            onChange={(e) => set(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <button
            type="button"
            onClick={() => set(options.filter((_, j) => j !== i))}
            className="text-[var(--text-4)] hover:text-[var(--danger-500)]"
            aria-label="Remove option"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => set([...options, { id: newId("opt"), label: `Option ${options.length + 1}` }])}
        className="text-xs text-[var(--brand-700)] hover:underline"
      >
        + Add option
      </button>
    </div>
  );
}

// ─── Preview ────────────────────────────────────────────────────────────────────

const PREVIEW_BANK: BankInput = {
  accountHolder: "",
  bankName: "",
  sortCode: "",
  accountNumber: "",
  iban: "",
  swiftBic: "",
  currency: "GBP",
};
const PREVIEW_BANK_SUMMARY: BankSummary = { onFile: false, currency: null, accountNumberLast4: null };

function StepPreview({
  structure,
  selStep,
  sel,
  answers,
  setAnswer,
}: {
  structure: OnboardingFormStructure;
  selStep: OnboardingStepDef | null;
  sel: Selection;
  answers: OnboardingAnswers;
  setAnswer: (id: string, value: OnboardingAnswerValue) => void;
}) {
  const ids = useMemo(() => fieldIdSet(structure), [structure]);
  const bank = { input: PREVIEW_BANK, setBank: () => () => {}, summary: PREVIEW_BANK_SUMMARY };

  if (sel.kind === "welcome") {
    const w = structure.welcome;
    return (
      <div className="space-y-3">
        {w.eyebrow ? <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-4)]">{w.eyebrow}</p> : null}
        <h2 className="text-xl font-semibold text-[var(--text-1)]">{w.subheading || w.heading}</h2>
        <ul className="space-y-2 text-sm text-[var(--text-3)]">
          {w.bullets.map((b, i) => (
            <li key={i}>• {b}</li>
          ))}
        </ul>
        <Button variant="primary" className="app-button-md w-full" disabled>
          {w.ctaLabel || "Get started"}
        </Button>
      </div>
    );
  }

  if (sel.kind === "review" || !selStep) {
    return (
      <p className="text-sm text-[var(--text-4)]">
        The review screen is auto-generated from the steps — a tap-to-edit summary of every answer.
      </p>
    );
  }

  const visible = selStep.fields.filter((f) => isFieldVisible(f, answers, ids));
  return (
    <div className="space-y-4">
      {selStep.blurb ? <p className="text-sm text-[var(--text-3)]">{selStep.blurb}</p> : null}
      <div className="flex flex-wrap gap-4">
        {visible.map((field) => (
          <div key={field.id} className={field.config?.width === "half" ? "w-full sm:w-[calc(50%-0.5rem)]" : "w-full"}>
            <FieldRenderer field={field} answers={answers} setAnswer={setAnswer} readOnly={false} bank={bank} />
          </div>
        ))}
        {visible.length === 0 && <p className="text-sm text-[var(--text-4)]">No fields to preview.</p>}
      </div>
    </div>
  );
}
