"use client";

/**
 * `LaunchpadFieldRenderer` — renders the three Launchpad-only field types and
 * DELEGATES everything else to onboarding's `FieldRenderer`.
 *
 * That delegation is the whole point of the sibling design: a `short_text` looks and
 * behaves identically in an onboarding link and a Launchpad, because it IS the same
 * component — including the iOS 16px anti-zoom rule and the input guards. Only the
 * types onboarding has no concept of are handled here.
 */

import { useEffect, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";
import { FieldRenderer, Field, TextInput } from "@/components/onboarding/field-renderer";
import { LAUNCHPAD_LINK_ERROR, safeLaunchpadLink } from "@/lib/launchpad/field-types";
import type { OnboardingAnswerValue, OnboardingFieldDef } from "@/types/onboarding";
import type {
  LaunchpadAnswers,
  LaunchpadFieldDef,
  LaunchpadItemState,
  LaunchpadItemStatus,
} from "@/types/launchpad";
import type { LaunchpadItemPatch } from "@/lib/api";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/** The bank sub-form's props are required by `FieldRenderer` but a Launchpad never
 *  collects bank details — it points the client at their payment provider instead.
 *  An inert stub keeps the shared component's signature honest without pretending
 *  the field type is reachable (the registry marks `bank_details` non-custom). */
const NO_BANK = {
  input: {
    accountHolder: "",
    bankName: "",
    sortCode: "",
    accountNumber: "",
    iban: "",
    swiftBic: "",
    currency: "",
  },
  setBank: () => () => {},
  summary: { onFile: false, currency: null, accountNumberLast4: null },
};

// ─── Status control ───────────────────────────────────────────────────────────

const STATUS_META: Record<
  LaunchpadItemStatus,
  { label: string; className: string; activeClassName: string }
> = {
  NEEDED: {
    label: "Needed",
    className: "text-[var(--text-4)]",
    activeClassName: "border-amber-200 bg-amber-50 text-amber-700",
  },
  PROVIDED: {
    label: "Provided",
    className: "text-[var(--text-4)]",
    activeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  NA: {
    label: "N/A",
    className: "text-[var(--text-4)]",
    activeClassName: "border-slate-300 bg-slate-100 text-slate-600",
  },
};

const STATUS_ORDER: LaunchpadItemStatus[] = ["NEEDED", "PROVIDED", "NA"];

function StatusPicker({
  value,
  onChange,
  disabled,
}: {
  value: LaunchpadItemStatus;
  onChange: (next: LaunchpadItemStatus) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-1)] p-0.5"
      role="group"
      aria-label="Status"
    >
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const active = value === status;
        return (
          <button
            key={status}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(status)}
            className={[
              "rounded-[4px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition disabled:opacity-50",
              active
                ? meta.activeClassName
                : `border-transparent ${meta.className} hover:bg-[var(--surface-0)] hover:text-[var(--text-2)]`,
            ].join(" ")}
            style={{ fontFamily: MONO }}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── checklist_item ───────────────────────────────────────────────────────────

function ChecklistItem({
  field,
  state,
  onPatch,
  readOnly,
  audience,
}: {
  field: LaunchpadFieldDef;
  state: LaunchpadItemState | undefined;
  onPatch: (patch: LaunchpadItemPatch) => void;
  readOnly: boolean;
  audience: "client" | "team";
}) {
  const status = state?.status ?? "NEEDED";
  const ownedByClient = state?.ownedByClient ?? field.ownedByClient ?? null;
  const [link, setLink] = useState(state?.link ?? "");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [note, setNote] = useState(state?.note ?? "");
  const [showNote, setShowNote] = useState(Boolean(state?.note));

  // Follow the server's value when a write lands (the DTO is authoritative), but
  // never mid-typing — the local value is what the person is looking at.
  useEffect(() => {
    setLink(state?.link ?? "");
    setLinkError(null);
  }, [state?.link]);
  useEffect(() => {
    setNote(state?.note ?? "");
  }, [state?.note]);

  const resolved = status === "PROVIDED" || status === "NA";

  return (
    <div
      className={[
        "rounded-[10px] border p-3 transition-colors sm:p-4",
        status === "PROVIDED"
          ? "border-[var(--border-1)] bg-[var(--surface-1)]"
          : status === "NA"
            ? "border-[var(--border-1)] bg-[var(--surface-1)] opacity-75"
            : "border-[var(--border-2)] bg-[var(--surface-0)]",
      ].join(" ")}
    >
      {/* Label + status. Wraps below sm so the picker never runs off a phone. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {resolved ? (
              status === "PROVIDED" ? (
                <CheckCircleIcon className="h-4 w-4 shrink-0 text-[var(--success-500)]" />
              ) : (
                <MinusCircleIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
              )
            ) : null}
            <p className="text-sm font-semibold text-[var(--text-1)]">{field.label}</p>
          </div>
          {field.helper ? (
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">{field.helper}</p>
          ) : null}
        </div>
        <StatusPicker
          value={status}
          onChange={(next) => onPatch({ status: next })}
          disabled={readOnly}
        />
      </div>

      {/* Owner + link + note. */}
      <div className="mt-3 space-y-2">
        {/* The same fact, phrased for whoever is reading it. "Your account — in your
            name" is right for the client and wrong for a Gitwork user looking at the
            internal view, where "your" refers to the wrong party. */}
        {ownedByClient !== null ? (
          <p
            className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]"
            style={{ fontFamily: MONO }}
          >
            {audience === "client"
              ? ownedByClient
                ? "Your account — in your name"
                : "Gitwork holds this"
              : ownedByClient
                ? "Client-owned"
                : "Gitwork-owned"}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="app-input min-h-[44px] flex-1 text-base sm:min-h-[36px] sm:text-sm"
            type="url"
            inputMode="url"
            placeholder="Paste a link (optional)"
            value={link}
            disabled={readOnly}
            aria-invalid={linkError ? true : undefined}
            onChange={(e) => {
              setLink(e.target.value);
              if (linkError) setLinkError(null);
            }}
            onBlur={() => {
              if ((state?.link ?? "") === link) return;
              // Tell them WHY rather than letting the server drop it and the value
              // silently revert — which is what a "we ignore what we can't parse"
              // write path looks like from the client's side.
              if (link.trim() !== "" && !safeLaunchpadLink(link)) {
                setLinkError(LAUNCHPAD_LINK_ERROR);
                return;
              }
              setLinkError(null);
              onPatch({ link });
            }}
          />
          {safeLaunchpadLink(state?.link) ? (
            <a
              href={safeLaunchpadLink(state?.link) as string}
              target="_blank"
              rel="noreferrer noopener"
              className="app-button app-button-secondary app-button-sm shrink-0"
            >
              Open
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        {linkError ? (
          <p className="text-xs text-[var(--danger-500)]" role="alert">
            {linkError}
          </p>
        ) : null}

        {showNote || note ? (
          <textarea
            className="app-textarea text-base sm:text-sm"
            rows={2}
            placeholder="Add a note (optional)"
            value={note}
            disabled={readOnly}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if ((state?.note ?? "") !== note) onPatch({ note });
            }}
          />
        ) : !readOnly ? (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="app-button app-button-tertiary app-button-xs"
          >
            + Add a note
          </button>
        ) : null}

        {state?.updatedBy && resolved ? (
          <p className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            {STATUS_META[status].label} · {state.updatedBy}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─── link ─────────────────────────────────────────────────────────────────────

function LinkField({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: LaunchpadFieldDef;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLocal(value);
    setError(null);
  }, [value]);
  return (
    <Field label={field.label} hint={error ?? field.helper ?? field.hint} required={field.required}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          {/* Committed on BLUR, not per keystroke: a URL is only meaningful once it
              is complete, and a debounced write per character would fail the
              http(s) check on every intermediate value and show the client an
              error while they were still typing. */}
          <TextInput
            type="url"
            inputMode="url"
            value={local}
            onChange={setLocal}
            readOnly={readOnly}
            placeholder={field.placeholder ?? "https://…"}
            onBlur={() => {
              if (local === value) return;
              if (local.trim() !== "" && !safeLaunchpadLink(local)) {
                setError(LAUNCHPAD_LINK_ERROR);
                return;
              }
              setError(null);
              onChange(local);
            }}
          />
        </div>
        {safeLaunchpadLink(value) ? (
          <a
            href={safeLaunchpadLink(value) as string}
            target="_blank"
            rel="noreferrer noopener"
            className="app-button app-button-secondary app-button-sm shrink-0"
          >
            Open
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </Field>
  );
}

// ─── The renderer ─────────────────────────────────────────────────────────────

export interface LaunchpadFieldRendererProps {
  field: LaunchpadFieldDef;
  answers: LaunchpadAnswers;
  itemState: LaunchpadItemState | undefined;
  setAnswer: (id: string, value: OnboardingAnswerValue) => void;
  patchItem: (itemId: string, patch: LaunchpadItemPatch) => void;
  readOnly: boolean;
  /** Who is reading — only copy differs, never the facts or the controls. */
  audience: "client" | "team";
}

export function LaunchpadFieldRenderer({
  field,
  answers,
  itemState,
  setAnswer,
  patchItem,
  readOnly,
  audience,
}: LaunchpadFieldRendererProps) {
  if (field.type === "checklist_item") {
    return (
      <ChecklistItem
        field={field}
        state={itemState}
        onPatch={(patch) => patchItem(field.id, patch)}
        readOnly={readOnly}
        audience={audience}
      />
    );
  }

  if (field.type === "link") {
    const raw = answers[field.id];
    return (
      <LinkField
        field={field}
        value={typeof raw === "string" ? raw : ""}
        onChange={(next) => setAnswer(field.id, next)}
        readOnly={readOnly}
      />
    );
  }

  // `legal_doc` is rendered by the section itself, not here — it needs the whole
  // doc state (answers + body + approval), which is more than a field renderer's
  // contract carries. Returning null keeps this function total.
  if (field.type === "legal_doc") return null;

  // Everything else is genuinely a shared onboarding field. The cast is safe by
  // construction: this branch is unreachable for the three types above, so `type`
  // is an OnboardingFieldType here.
  return (
    <FieldRenderer
      field={{ ...field, hint: field.hint ?? field.helper } as OnboardingFieldDef}
      answers={answers}
      setAnswer={setAnswer}
      readOnly={readOnly}
      bank={NO_BANK}
    />
  );
}
