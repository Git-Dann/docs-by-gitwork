"use client";

/**
 * Record a deal that didn't come from Docs: drop in a PDF or Word file and Foundry reads the
 * figures for you to check, or type them in. Saved as an accepted document (rules in
 * src/lib/money-deals.ts), so Money counts it straight away. Nothing from a file is saved until
 * you press Save, and the file itself isn't kept.
 */

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { DocumentArrowUpIcon, PlusIcon, TrashIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/motion/spinner";
import { cn } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { DEAL_CURRENCIES, dealProblems, dealTotal, type DealDraft, type DealInput, type DealLine } from "@/lib/money-deals";

const LABEL = "block text-[12px] font-medium text-[var(--text-2)]";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const KIND_OPTIONS: Array<{ value: DealLine["kind"]; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "once", label: "One-off" },
  { value: "ongoing", label: "Monthly, no end" },
];

export function RecordDealDialog({
  open,
  onClose,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  clients: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [wonOn, setWonOn] = useState(today());
  const [currency, setCurrency] = useState("GBP");
  const [lines, setLines] = useState<DealLine[]>([{ label: "", kind: "monthly", amount: 0, months: 6 }]);
  const [source, setSource] = useState<DealInput["source"]>({ kind: "manual" });
  const [notes, setNotes] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);

  const input: DealInput = { clientId, title, wonOn, currency, lines, source };
  const problems = dealProblems(input);

  function reset() {
    setClientId("");
    setTitle("");
    setWonOn(today());
    setCurrency("GBP");
    setLines([{ label: "", kind: "monthly", amount: 0, months: 6 }]);
    setSource({ kind: "manual" });
    setNotes([]);
    setError(null);
    setTouched(false);
  }

  const save = useMutation({
    mutationFn: () => apiFetch<{ id: string }>("/api/money/deals", { method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["money"] });
      reset();
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save the deal."),
  });

  async function readFile(file: File) {
    setReading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const draft = await apiFetch<DealDraft & { clientId: string | null }>("/api/money/read-file", { method: "POST", body });
      if (draft.title) setTitle(draft.title);
      if (draft.clientId) setClientId(draft.clientId);
      if (draft.currency) setCurrency(draft.currency);
      if (draft.wonOn) setWonOn(draft.wonOn);
      if (draft.lines.length) setLines(draft.lines);
      setNotes([...(draft.clientName && !draft.clientId ? [`The file names “${draft.clientName}”. Choose the client it belongs to.`] : []), ...draft.notes]);
      setSource({ kind: "file", fileName: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setReading(false);
    }
  }

  function setLine(i: number, patch: Partial<DealLine>) {
    setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch, foundInFile: patch.amount !== undefined ? undefined : l.foundInFile } : l)));
  }

  const total = dealTotal(lines);

  return (
    <Modal open={open} onClose={onClose} title="Record a deal" panelClassName="app-dialog-fixed w-full max-w-2xl">
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (problems.length === 0) save.mutate();
        }}
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          {/* Drop a file to fill everything in. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void readFile(f);
            }}
            disabled={reading}
            className={cn(
              "flex w-full items-center gap-3 rounded-[10px] border border-dashed px-4 py-4 text-left transition",
              dragging ? "border-[var(--brand-500)] bg-[var(--brand-50)]" : "border-[var(--border-2)] hover:border-[var(--brand-400)] hover:bg-[var(--surface-1)]",
            )}
          >
            {reading ? <Spinner /> : <DocumentArrowUpIcon className="h-6 w-6 shrink-0 text-[var(--brand-600)]" />}
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--text-1)]">
                {reading ? "Reading the figures…" : source.kind === "file" ? `Read from ${source.fileName}` : "Drop a proposal, quote or contract"}
              </span>
              <span className="block text-xs text-[var(--text-3)]">
                {source.kind === "file" ? "Check every figure before saving. Drop another to replace it." : "PDF, Word or text. Foundry fills in the figures for you to check. The file isn't kept."}
              </span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void readFile(f);
            }}
          />

          {notes.length > 0 ? (
            <motion.ul
              initial={reduce ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-1 rounded-[8px] border border-[var(--warning-500)]/40 bg-[var(--warning-50)] px-3 py-2 text-xs text-[var(--text-2)]"
            >
              {notes.map((n) => (
                <li key={n} className="flex gap-2">
                  <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning-500)]" />
                  {n}
                </li>
              ))}
            </motion.ul>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={LABEL}>
              Client
              <select className="app-select app-select-chevron mt-1 w-full pr-9" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Choose a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Name
              <input className="app-input mt-1 w-full text-base sm:text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Phase 2 build" />
            </label>
            <label className={LABEL}>
              Agreed on
              <input type="date" className="app-input mt-1 w-full text-base sm:text-sm" value={wonOn} max={today()} onChange={(e) => setWonOn(e.target.value)} />
            </label>
            <label className={LABEL}>
              Currency
              <select className="app-select app-select-chevron mt-1 w-full pr-9" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {DEAL_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className={LABEL}>What they&apos;re paying, before VAT</span>
              <span className="text-xs tabular-nums text-[var(--text-3)]">Worth {formatMoney(total, currency)}</span>
            </div>
            <ul className="space-y-2">
              {lines.map((l, i) => (
                <li key={i} className="grid grid-cols-2 gap-2 rounded-[8px] border border-[var(--border-1)] p-2.5 sm:grid-cols-[1fr_170px_110px_80px_auto]">
                  <input
                    aria-label={`Line ${i + 1}: what it's for`}
                    className="app-input col-span-2 text-base sm:col-span-1 sm:text-sm"
                    value={l.label}
                    placeholder="Senior developer"
                    onChange={(e) => setLine(i, { label: e.target.value })}
                  />
                  <select
                    aria-label={`Line ${i + 1}: how it's paid`}
                    className="app-select app-select-chevron col-span-2 pr-9 sm:col-span-1"
                    value={l.kind}
                    onChange={(e) => setLine(i, { kind: e.target.value as DealLine["kind"], months: e.target.value === "monthly" ? l.months ?? 6 : null })}
                  >
                    {KIND_OPTIONS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <input
                      aria-label={`Line ${i + 1}: amount`}
                      inputMode="decimal"
                      className={cn("app-input w-full text-base tabular-nums sm:text-sm", l.foundInFile === false && "border-[var(--warning-500)]")}
                      value={l.amount || ""}
                      placeholder="Amount"
                      onChange={(e) => setLine(i, { amount: Number(e.target.value.replace(/[^0-9.]/g, "")) })}
                      title={l.foundInFile === false ? "This amount isn't written in the file as shown. Check it." : undefined}
                    />
                  </div>
                  {l.kind === "monthly" ? (
                    <input
                      aria-label={`Line ${i + 1}: months`}
                      inputMode="numeric"
                      className="app-input w-full text-base tabular-nums sm:text-sm"
                      value={l.months ?? ""}
                      placeholder="Months"
                      title="How many months"
                      onChange={(e) => setLine(i, { months: Math.round(Number(e.target.value.replace(/[^0-9]/g, ""))) || null })}
                    />
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <button
                    type="button"
                    onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))}
                    disabled={lines.length === 1}
                    aria-label={`Remove line ${i + 1}`}
                    className="justify-self-end rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--danger-500)] disabled:opacity-30"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setLines((cur) => [...cur, { label: "", kind: "once", amount: 0, months: null }])}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-700)] hover:underline"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add a line
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-1)] px-5 py-3 sm:px-6">
          {error || (touched && problems.length) ? (
            <p role="alert" className="mr-auto min-w-0 flex-1 basis-full text-[12px] text-[var(--danger-500)] sm:basis-auto">
              {error ?? problems[0]}
            </p>
          ) : (
            <p className="mr-auto hidden text-[12px] text-[var(--text-4)] sm:block">Saved as an accepted document in Docs.</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-[7px] border border-[var(--border-2)] px-3.5 py-1.5 text-[13px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending || reading}
            className="rounded-[7px] bg-[var(--brand-600)] px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save deal"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
