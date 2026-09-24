"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useCreateHandover, useHandovers } from "@/hooks/use-handover";
import { HandoverDetail } from "@/components/backstage/handover-detail";
import type { HandoverSummaryDTO } from "@/types/handover";

/**
 * Backstage → Handover.
 *
 * One handover per period away. The list is deliberately plain — it is a way in,
 * not a dashboard; everything that matters lives inside one.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

function formatRange(startsOn: string, endsOn: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  return `${new Date(startsOn).toLocaleDateString("en-GB", opts)} – ${new Date(endsOn).toLocaleDateString("en-GB", opts)}`;
}

export function HandoverTab() {
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useHandovers(!openId);
  const create = useCreateHandover();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(inDays(7));
  const [error, setError] = useState<string | null>(null);

  if (openId) return <HandoverDetail id={openId} onBack={() => setOpenId(null)} />;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    void create
      .mutateAsync({
        title: trimmed,
        startsOn,
        endsOn,
        standingRule: null,
      })
      .then((row) => {
        setCreating(false);
        setTitle("");
        setOpenId(row.id);
      })
      .catch(() => setError("Couldn't create that handover."));
  };

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>
          {" // HANDOVER"}
        </span>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-[var(--brand-700)] transition-colors hover:text-[var(--brand-800)]"
        >
          <PlusIcon className="h-3.5 w-3.5" /> New
        </button>
      </div>

      <div className="p-3 sm:p-4">
        <p className="mb-3 max-w-[70ch] text-xs leading-5 text-[var(--text-3)]">
          What someone hands over when they go away: what nobody else is allowed to decide, what is
          open and unclosed, and the standing duties that simply stop if no one picks them up.
        </p>

        {creating ? (
          <div className="mb-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input
                className="app-input sm:col-span-2"
                placeholder="e.g. Dan away 6–13 Oct"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <input
                className="app-input"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
              <input
                className="app-input"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={!title.trim() || create.isPending}
                className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-2 py-1.5 text-xs text-[var(--text-3)]"
              >
                Cancel
              </button>
              {error ? <span className="text-xs text-[var(--danger-500)]">{error}</span> : null}
            </div>
          </div>
        ) : null}

        {list.isLoading ? (
          <div className="h-24 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : (list.data ?? []).length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-6 text-center text-sm text-[var(--text-3)]">
            No handovers yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-1)] border-y border-[var(--border-1)]">
            {(list.data ?? []).map((h) => (
              <Row key={h.id} row={h} onOpen={() => setOpenId(h.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ row, onOpen }: { row: HandoverSummaryDTO; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-[var(--surface-1)]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-1)]" title={row.title}>
            {row.title}
          </p>
          <p
            className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {formatRange(row.startsOn, row.endsOn)}
            {row.userName ? ` · ${row.userName}` : ""}
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {/* Only what still needs doing carries colour — a finished handover
              should read as finished at a glance. */}
          <Badge n={row.openDecisions} label="decisions" tone={row.openDecisions > 0 ? "warn" : "quiet"} />
          <Badge n={row.openRisks} label="open" tone={row.openRisks > 0 ? "warn" : "quiet"} />
          <Badge n={row.duties} label="duties" tone="quiet" />
        </div>
      </button>
    </li>
  );
}

function Badge({ n, label, tone }: { n: number; label: string; tone: "warn" | "quiet" }) {
  return (
    <span
      className={cn(
        "hidden rounded-[4px] px-1.5 py-0.5 tabular-nums sm:inline",
        tone === "warn"
          ? "bg-[var(--warning-50)] text-[var(--warning-500)]"
          : "bg-[var(--surface-2)] text-[var(--text-4)]",
      )}
    >
      {n} {label}
    </span>
  );
}
