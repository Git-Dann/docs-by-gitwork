"use client";

import { useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useClientList } from "@/hooks/use-proposals";
import { useProposalList } from "@/hooks/use-proposals";
import { usePulseScans } from "@/hooks/use-pulse";
import type { StarterMergeGroup } from "@/lib/starter-merge-variables";

export interface PickedClient {
  kind: "client";
  id: string;
  slug: string;
  label: string;
}
export interface PickedDocument {
  kind: "document";
  id: string;
  label: string;
}
export interface PickedScan {
  kind: "pulseScan";
  id: string;
  label: string;
}
export type PickedRecord = PickedClient | PickedDocument | PickedScan;

/**
 * Search-and-pick list for one merge-variable group (Client / Document / Pulse scan). Mounted
 * inline inside the Insert dropdown's second step. Reuses the same list hooks/queries the rest of
 * the app already uses for these pickers — no new API routes.
 */
export function StarterRecordPicker({
  group,
  onPick,
}: {
  group: StarterMergeGroup;
  onPick: (record: PickedRecord) => void;
}) {
  const [query, setQuery] = useState("");

  return (
    <div className="w-72">
      <div className="relative border-b border-[var(--border-2)] p-2">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-4)]" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${group === "pulseScan" ? "Pulse scans" : group === "client" ? "clients" : "documents"}…`}
          className="w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] py-1.5 pl-7 pr-2 text-xs text-[var(--text-1)] outline-none focus:border-[var(--brand-400)]"
        />
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {group === "client" && <ClientOptions query={query} onPick={onPick} />}
        {group === "document" && <DocumentOptions query={query} onPick={onPick} />}
        {group === "pulseScan" && <ScanOptions query={query} onPick={onPick} />}
      </div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <p className="px-3 py-3 text-center text-xs text-[var(--text-4)]">{label}</p>;
}

function Row({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex w-full flex-col items-start px-3 py-1.5 text-left transition-colors hover:bg-[var(--surface-1)]"
    >
      <span className="truncate text-xs font-medium text-[var(--text-1)]">{label}</span>
      {sub && <span className="truncate text-[10px] text-[var(--text-4)]">{sub}</span>}
    </button>
  );
}

function ClientOptions({ query, onPick }: { query: string; onPick: (r: PickedRecord) => void }) {
  const { data, isLoading } = useClientList({ search: query || undefined });
  const clients = data?.clients ?? [];
  if (isLoading) return <EmptyRow label="Loading…" />;
  if (clients.length === 0) return <EmptyRow label="No clients match." />;
  return (
    <>
      {clients.slice(0, 20).map((c) => (
        <Row
          key={c.id}
          label={c.name}
          onClick={() => onPick({ kind: "client", id: c.id, slug: c.slug, label: c.name })}
        />
      ))}
    </>
  );
}

function DocumentOptions({ query, onPick }: { query: string; onPick: (r: PickedRecord) => void }) {
  const { data, isLoading } = useProposalList({ search: query });
  const proposals = data?.proposals ?? [];
  if (isLoading) return <EmptyRow label="Loading…" />;
  if (proposals.length === 0) return <EmptyRow label="No documents match." />;
  return (
    <>
      {proposals.slice(0, 20).map((p) => (
        <Row
          key={p.id}
          label={p.title}
          sub={p.clientName ?? undefined}
          onClick={() => onPick({ kind: "document", id: p.id, label: p.title })}
        />
      ))}
    </>
  );
}

function ScanOptions({ query, onPick }: { query: string; onPick: (r: PickedRecord) => void }) {
  const { data, isLoading } = usePulseScans();
  const all = data?.scans ?? [];
  const scans = query
    ? all.filter(
        (s) =>
          s.projectName.toLowerCase().includes(query.toLowerCase()) ||
          (s.clientName ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : all;
  if (isLoading) return <EmptyRow label="Loading…" />;
  if (scans.length === 0) return <EmptyRow label="No scans match." />;
  return (
    <>
      {scans.slice(0, 20).map((s) => (
        <Row
          key={s.id}
          label={s.projectName}
          sub={s.clientName ?? undefined}
          onClick={() => onPick({ kind: "pulseScan", id: s.id, label: s.projectName })}
        />
      ))}
    </>
  );
}
