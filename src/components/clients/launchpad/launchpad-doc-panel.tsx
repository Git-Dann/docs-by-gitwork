"use client";

/**
 * One fillable boilerplate legal doc: the red TEMPLATE banner, the question set,
 * the rendered draft, an editor, and Approve.
 *
 * ⚠️ The banner renders UNCONDITIONALLY, above everything, and its text comes from
 * `LAUNCHPAD_LEGAL_BANNER` rather than from the doc body. That is the design: the
 * client can edit the body, so a banner living inside the markdown would be one
 * backspace away from a document reading as finished legal advice. It shows on a
 * TEMPLATE, on an EDITED draft, and on an APPROVED one — approval is the client
 * accepting a draft, not a lawyer signing it off.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { Markdown } from "@/lib/markdown";
import { LAUNCHPAD_LEGAL_BANNER, legalDocFields } from "@/lib/launchpad/legal/render";
import type { LegalFieldDef } from "@/lib/launchpad/legal/types";
import type { LaunchpadAnswers, LaunchpadDocState } from "@/types/launchpad";
import type { LaunchpadDocPatch } from "@/lib/api";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const STATUS_CHIP: Record<LaunchpadDocState["status"], { label: string; className: string }> = {
  TEMPLATE: { label: "Draft", className: "border-slate-300 bg-slate-100 text-slate-600" },
  EDITED: { label: "Edited", className: "border-blue-200 bg-blue-50 text-blue-700" },
  APPROVED: { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

/** The red banner. Uses the danger token, not a hand-mixed red, so it is correct in
 *  dark mode — where a `bg-red-600` + white slab fails contrast. */
export function TemplateBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-[10px] border border-[var(--danger-500)] bg-[var(--danger-50)] px-3 py-2.5"
    >
      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-500)]" />
      <p className="text-xs font-semibold leading-relaxed text-[var(--danger-700)]">
        {LAUNCHPAD_LEGAL_BANNER}
      </p>
    </div>
  );
}

function AnswerField({
  def,
  value,
  onChange,
  readOnly,
}: {
  def: LegalFieldDef;
  value: LaunchpadAnswers[string];
  onChange: (next: string | boolean) => void;
  readOnly: boolean;
}) {
  const str = typeof value === "string" ? value : "";
  const [local, setLocal] = useState(str);
  useEffect(() => setLocal(str), [str]);

  const commit = () => {
    if (local !== str) onChange(local);
  };

  if (def.type === "checkbox") {
    return (
      <label className="flex items-start gap-2.5 py-1">
        <input
          type="checkbox"
          className="app-checkbox mt-0.5"
          checked={value === true}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="min-w-0 text-sm text-[var(--text-2)]">
          {def.label}
          {def.helper ? (
            <span className="mt-0.5 block text-xs text-[var(--text-4)]">{def.helper}</span>
          ) : null}
        </span>
      </label>
    );
  }

  return (
    <label className="block space-y-1.5">
      <span className="app-field-label">
        {def.label}
        {def.required && <span className="ml-1 text-[var(--danger-500)]">*</span>}
      </span>
      {def.type === "select" ? (
        <select
          // app-select-chevron draws the arrow from 7–20px in, so pr-9 is the
          // minimum that keeps a long value clear of it (audit:ui SELECT-PAD).
          className="app-select app-select-chevron min-h-[44px] w-full pr-9 text-base sm:min-h-[36px] sm:text-sm"
          value={str}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {(def.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : def.type === "long_text" ? (
        <textarea
          className="app-textarea text-base sm:text-sm"
          rows={3}
          value={local}
          disabled={readOnly}
          placeholder={def.placeholder}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          className="app-input min-h-[44px] text-base sm:min-h-[36px] sm:text-sm"
          type={def.type === "email" ? "email" : def.type === "url" ? "url" : "text"}
          value={local}
          disabled={readOnly}
          placeholder={def.placeholder}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
        />
      )}
      {def.helper ? <span className="app-field-hint">{def.helper}</span> : null}
    </label>
  );
}

export function LaunchpadDocPanel({
  doc,
  index,
  onPatch,
  onApprove,
  readOnly,
  busy,
}: {
  doc: LaunchpadDocState;
  /** Widget number within the Launchpad screen. */
  index: number;
  onPatch: (patch: LaunchpadDocPatch) => void;
  onApprove: (approved: boolean) => void;
  readOnly: boolean;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"questions" | "document">("questions");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.body);
  const fields = useMemo(() => legalDocFields(doc.docKey), [doc.docKey]);

  useEffect(() => {
    setDraft(doc.body);
  }, [doc.body]);

  const missing = fields.filter(
    (f) => f.required && !String(doc.answers[f.id] ?? "").trim(),
  );
  const chip = STATUS_CHIP[doc.status];

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">
            {String(index).padStart(2, "0")}
          </span>
          {` // ${doc.title.toUpperCase()}`}
        </span>
        <span className="widget-header__right flex items-center gap-2">
          <span
            className={`inline-flex shrink-0 items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${chip.className}`}
          >
            {chip.label}
          </span>
        </span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <TemplateBanner />

        {/* Questions / Document. A segmented control, per DESIGN.md's pick-one
            grammar — not underlined tabs, which read as the web default. */}
        <div className="inline-flex items-center gap-0.5 rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-1)] p-0.5">
          {(["questions", "document"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={[
                "rounded-[4px] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition",
                tab === key
                  ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-[var(--text-4)] hover:text-[var(--text-2)]",
              ].join(" ")}
              style={{ fontFamily: MONO }}
            >
              {key === "questions" ? "Your answers" : "The document"}
            </button>
          ))}
        </div>

        {tab === "questions" ? (
          <div className="space-y-4">
            {missing.length > 0 ? (
              <p className="text-xs text-[var(--text-3)]">
                {missing.length} answer{missing.length === 1 ? "" : "s"} still needed — until then
                the draft shows the placeholder in the text, so nothing reads as finished when it
                isn&apos;t.
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {fields.map((def) => (
                <div key={def.id} className={def.width === "half" ? "" : "sm:col-span-2"}>
                  <AnswerField
                    def={def}
                    value={doc.answers[def.id]}
                    onChange={(next) => onPatch({ answers: { [def.id]: next } })}
                    readOnly={readOnly || busy}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {editing ? (
              <>
                <textarea
                  className="app-textarea min-h-[320px] font-mono text-xs"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="app-button app-button-primary app-button-sm"
                    disabled={busy}
                    onClick={() => {
                      onPatch({ body: draft });
                      setEditing(false);
                    }}
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    className="app-button app-button-secondary app-button-sm"
                    onClick={() => {
                      setDraft(doc.body);
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </button>
                  {doc.edited ? (
                    <button
                      type="button"
                      className="app-button app-button-tertiary app-button-sm"
                      disabled={busy}
                      title="Discard your edits and go back to the generated draft"
                      onClick={() => {
                        onPatch({ body: "" });
                        setEditing(false);
                      }}
                    >
                      Reset to the generated draft
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="max-h-[420px] overflow-y-auto rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] p-4">
                  <Markdown compact>{doc.body}</Markdown>
                </div>
                {!readOnly ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="app-button app-button-secondary app-button-sm"
                      onClick={() => setEditing(true)}
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                      Edit the wording
                    </button>
                    {doc.status === "APPROVED" ? (
                      <button
                        type="button"
                        className="app-button app-button-tertiary app-button-sm"
                        disabled={busy}
                        onClick={() => onApprove(false)}
                      >
                        Withdraw approval
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="app-button app-button-primary app-button-sm"
                        disabled={busy}
                        onClick={() => onApprove(true)}
                      >
                        <CheckBadgeIcon className="h-4 w-4" />
                        Approve this draft
                      </button>
                    )}
                  </div>
                ) : null}
              </>
            )}

            {doc.status === "APPROVED" && doc.approvedAt ? (
              <p className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                Approved {new Date(doc.approvedAt).toLocaleDateString("en-GB")}
                {doc.approvedByEmail ? ` · ${doc.approvedByEmail}` : ""} · not an e-signature
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
