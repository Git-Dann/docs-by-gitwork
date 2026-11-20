"use client";

/**
 * Money (/app/money): revenue under contract, what's still to bill, what's been won and what's
 * in the pipeline. Super Admins and people granted `clients.viewFinancials` only: the page and
 * the API both check. Every figure is worked out from accepted documents (src/lib/money.ts) and
 * the page says how, so nobody mistakes it for invoices.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowTrendingDownIcon, ArrowTrendingUpIcon, ClipboardDocumentIcon, CheckIcon, PlusIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { getMoney } from "@/lib/api";
import { useCountUp } from "@/components/ui/motion/use-count-up";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { Segmented } from "@/components/ui/segmented";
import { TileHeader } from "@/components/dashboard/tile-header";
import { formatMoney, monthLabel, type MoneySummary } from "@/lib/money";
import { RecordDealDialog } from "@/components/money/record-deal-dialog";

const MONO = { fontFamily: "var(--font-mono)" } as const;
const SERIF = { fontFamily: "var(--font-display)" } as const;

export function MoneyWorkspace() {
  const q = useQuery({ queryKey: ["money"], queryFn: getMoney, staleTime: 5 * 60_000 });

  if (q.isPending) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-[10px]" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-[10px]" />
        <Skeleton className="h-64 rounded-[10px]" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <section className="widget-card p-6 text-sm text-[var(--text-2)]">
        Money couldn&apos;t be loaded just now.{" "}
        <button type="button" className="font-medium text-[var(--brand-700)] hover:underline" onClick={() => void q.refetch()}>
          Try again
        </button>
      </section>
    );
  }
  return <MoneyView m={q.data} />;
}

export function MoneyView({ m }: { m: MoneySummary }) {
  return (
    <div className="space-y-4">
      <Headline m={m} />
      <RevenueChart m={m} index={1} />
      <ClientsTable m={m} index={2} />
      <Deals m={m} index={3} />
      <HowWorkedOut m={m} />
    </div>
  );
}

// ── Headline figures ───────────────────────────────────────────────────────────

function Money({ value, base, compact = true }: { value: number; base: string; compact?: boolean }) {
  const shown = useCountUp(value);
  return <>{formatMoney(shown, base, { compact })}</>;
}

function Headline({ m }: { m: MoneySummary }) {
  const change = m.monthChange;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-money-headline>
      <Figure
        label="This month"
        value={<Money value={m.thisMonth} base={m.base} />}
        note={
          change == null ? (
            "Under signed documents"
          ) : (
            <span className={cn("inline-flex items-center gap-1", change >= 0 ? "text-[var(--success-500)]" : "text-[var(--danger-500)]")}>
              {change >= 0 ? <ArrowTrendingUpIcon className="h-3.5 w-3.5" /> : <ArrowTrendingDownIcon className="h-3.5 w-3.5" />}
              {`${change >= 0 ? "+" : ""}${Math.round(change * 100)}% on last month`}
            </span>
          )
        }
        accent
      />
      <Figure label="Still to bill" value={<Money value={m.toCome} base={m.base} />} note="Signed work after this month" />
      <Figure
        label="Won, last 12 months"
        value={<Money value={m.wonLast12} base={m.base} />}
        note={`${m.dealsLast12} ${m.dealsLast12 === 1 ? "deal" : "deals"}`}
      />
      <Figure
        label="Pipeline"
        value={<Money value={m.pipeline} base={m.base} />}
        note={`${m.pipelineDeals} sent, waiting on a decision`}
      />
    </div>
  );
}

function Figure({ label, value, note, accent }: { label: string; value: React.ReactNode; note: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn("widget-card motion-rise flex min-w-0 flex-col justify-between gap-2 p-3 sm:gap-3 sm:p-4", accent && "ring-1 ring-[var(--brand-200)]")}>
      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-4)]" style={MONO}>
        {label}
      </span>
      <span className="text-[26px] leading-none tracking-tight text-[var(--text-1)] tabular-nums sm:text-[34px]" style={SERIF}>
        {value}
      </span>
      <span className="text-xs text-[var(--text-3)]">{note}</span>
    </div>
  );
}

// ── Revenue by month ───────────────────────────────────────────────────────────

function RevenueChart({ m, index }: { m: MoneySummary; index: number }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...m.months.map((b) => b.amount));
  const [hover, setHover] = useState<number | null>(null);
  const current = m.months.findIndex((b, i) => b.future === false && (m.months[i + 1]?.future ?? true));
  const focus = hover ?? current;
  const bar = m.months[focus];

  return (
    <section className="widget-card" aria-label="Revenue by month">
      <TileHeader index={index} label="Revenue by month" status="Signed documents" />
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs text-[var(--text-3)]">{bar ? monthLabel(bar.month, "long") : ""}</p>
            <p className="text-2xl tabular-nums text-[var(--text-1)]" style={SERIF}>
              {bar ? formatMoney(bar.amount, m.base) : "—"}
            </p>
          </div>
          <Legend />
        </div>
        <div>
          <div
            className="flex h-48 items-end gap-1 sm:gap-1.5"
            role="list"
            onMouseLeave={() => setHover(null)}
          >
            {m.months.map((b, i) => {
              const h = Math.max(b.amount > 0 ? 3 : 1, (b.amount / max) * 100);
              const isCurrent = i === current;
              return (
                <button
                  key={b.month}
                  type="button"
                  role="listitem"
                  aria-label={`${monthLabel(b.month, "long")}: ${formatMoney(b.amount, m.base)}${b.future ? ", signed so far" : ""}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5 outline-none"
                >
                  <motion.span
                    initial={reduce ? false : { height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ type: "spring", stiffness: 140, damping: 20, delay: reduce ? 0 : i * 0.025 }}
                    className={cn(
                      "w-full rounded-t-[4px] transition-colors",
                      b.future
                        ? "border border-dashed border-[var(--brand-400)] bg-[var(--brand-50)]"
                        : isCurrent
                          ? "bg-[var(--brand-600)]"
                          : "bg-[var(--brand-300)] group-hover:bg-[var(--brand-500)] group-focus-visible:bg-[var(--brand-500)]",
                      focus === i && !isCurrent && !b.future && "bg-[var(--brand-500)]",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-[0.04em] sm:tracking-[0.08em]",
                      isCurrent ? "text-[var(--brand-700)]" : "text-[var(--text-4)]",
                      // Phones: every other month, always this month, so labels never collide.
                      !isCurrent && (i - current) % 2 !== 0 && "invisible sm:visible",
                    )}
                    style={MONO}
                  >
                    {monthLabel(b.month)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-[var(--text-3)]">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--brand-300)]" /> Earned
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--brand-600)]" /> This month
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-[var(--brand-400)] bg-[var(--brand-50)]" /> Signed so far
      </span>
    </div>
  );
}

// ── Clients ────────────────────────────────────────────────────────────────────

function ClientsTable({ m, index }: { m: MoneySummary; index: number }) {
  const [onlyEarning, setOnlyEarning] = useState(true);
  const rows = useMemo(
    () => (onlyEarning ? m.clients.filter((c) => c.thisMonth > 0 || c.toCome > 0 || c.wonLast12 > 0) : m.clients),
    [m.clients, onlyEarning],
  );
  const hidden = m.clients.length - rows.length;
  const contracted = (c: MoneySummary["clients"][number]) =>
    c.ongoing ? "Runs on" : c.contractedTo ? monthLabel(c.contractedTo, "long") : "—";

  return (
    <section className="widget-card" aria-label="Clients">
      <TileHeader index={index} label="Clients">
        <Segmented
          label="Which clients"
          value={onlyEarning ? "earning" : "all"}
          onChange={(v) => setOnlyEarning(v === "earning")}
          options={[
            { value: "earning", label: "Contracted", count: m.clients.filter((c) => c.thisMonth > 0 || c.toCome > 0 || c.wonLast12 > 0).length },
            { value: "all", label: "All", count: m.clients.length },
          ]}
        />
      </TileHeader>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--text-3)]">
          Nothing under contract yet. Revenue appears here once a proposal with costs is accepted or signed, or when you record a deal.
        </p>
      ) : (
        <>
          {/* Phones: one card per client. */}
          <ul className="divide-y divide-[var(--border-1)] md:hidden">
            {rows.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <Link href={`/app/portal/${c.slug}`} className="text-sm font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">
                  {c.name}
                </Link>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <Cell label="This month" value={formatMoney(c.thisMonth, m.base)} />
                  <Cell label="Still to come" value={formatMoney(c.toCome, m.base)} />
                  <Cell label="Contracted to" value={contracted(c)} />
                  <Cell label="Team at rate card" value={c.teamAtRateCard == null ? "—" : `${formatMoney(c.teamAtRateCard, m.base)}/mo`} />
                </dl>
              </li>
            ))}
          </ul>

          {/* From md: a table in its own scroller (the card clips, it doesn't scroll). */}
          <div className="hidden overflow-x-auto md:block">
            <table className="app-table app-table--dense min-w-[760px]">
              <thead>
                <tr>
                  <th className="text-left">Client</th>
                  <th className="text-right">This month</th>
                  <th className="text-right">Still to come</th>
                  <th className="text-left">Contracted to</th>
                  <th className="text-right">Won (12m)</th>
                  <th className="text-right" title="What the developers on this client are worth at rate-card rates">
                    Team at rate card
                  </th>
                  <th className="text-left">Retainer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/app/portal/${c.slug}`} className="font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">
                        {c.name}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{c.thisMonth ? formatMoney(c.thisMonth, m.base) : "—"}</td>
                    <td className="text-right tabular-nums">{c.toCome ? formatMoney(c.toCome, m.base) : "—"}</td>
                    <td>{contracted(c)}</td>
                    <td className="text-right tabular-nums">{c.wonLast12 ? formatMoney(c.wonLast12, m.base) : "—"}</td>
                    <td className="text-right tabular-nums">
                      {c.teamAtRateCard == null ? "—" : `${formatMoney(c.teamAtRateCard, m.base)}/mo`}
                      {c.unpricedDevs > 0 ? (
                        <span className="ml-1 text-[var(--text-4)]" title={`${c.unpricedDevs} developer(s) with no rate`}>
                          +{c.unpricedDevs}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {c.retainer ? <RetainerBar used={c.retainer.used} allowance={c.retainer.allowance} /> : <span className="text-[var(--text-4)]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {hidden > 0 ? (
        <p className="border-t border-[var(--border-1)] px-4 py-2.5 text-xs text-[var(--text-3)]">
          {hidden} active {hidden === 1 ? "client has" : "clients have"} nothing under contract.
        </p>
      ) : null}
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
        {label}
      </dt>
      <dd className="tabular-nums text-[var(--text-1)]">{value}</dd>
    </div>
  );
}

function RetainerBar({ used, allowance }: { used: number; allowance: number }) {
  const share = Math.min(used / allowance, 1);
  const over = used > allowance;
  return (
    <span className="inline-flex items-center gap-2" title={`${used} of ${allowance} days used this month`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <span
          className={cn("block h-full rounded-full", over ? "bg-[var(--danger-500)]" : "bg-[var(--brand-500)]")}
          style={{ width: `${share * 100}%` }}
        />
      </span>
      <span className="tabular-nums text-xs text-[var(--text-3)]">
        {used}/{allowance}d
      </span>
    </span>
  );
}

// ── Deals ──────────────────────────────────────────────────────────────────────

function Deals({ m, index }: { m: MoneySummary; index: number }) {
  const [view, setView] = useState<"won" | "pipeline">("won");
  const [recording, setRecording] = useState(false);
  const won = m.recentWins;
  const pipe = m.pipelineDocs;
  const fmt = (total: number | null, currency: string) => (total == null ? `${currency} (no rate)` : formatMoney(total, m.base));
  return (
    <section className="widget-card" aria-label="Deals">
      <TileHeader index={index} label="Deals">
        <Segmented
          label="Which deals"
          value={view}
          onChange={setView}
          options={[
            { value: "won", label: "Won", count: won.length },
            { value: "pipeline", label: "Pipeline", count: pipe.length },
          ]}
        />
        <button
          type="button"
          onClick={() => setRecording(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--brand-600)] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[var(--brand-700)]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Record a deal</span>
          <span className="sm:hidden">Deal</span>
        </button>
      </TileHeader>
      <RecordDealDialog open={recording} onClose={() => setRecording(false)} clients={m.clients.map((c) => ({ id: c.id, name: c.name }))} />
      <ul className="divide-y divide-[var(--border-1)]">
        {view === "won"
          ? won.map((d) => (
              <DealRow
                key={d.id}
                href={`/app/docs/${d.id}`}
                title={d.title}
                client={d.clientName}
                meta={`${d.recorded ? "Recorded" : "Won"} ${new Date(d.wonAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                amount={fmt(d.total, d.currency)}
              />
            ))
          : pipe.map((d) => (
              <DealRow
                key={d.id}
                href={`/app/docs/${d.id}`}
                title={d.title}
                client={d.clientName}
                meta={d.viewed ? "Opened by the client" : "Not opened yet"}
                amount={fmt(d.total, d.currency)}
              />
            ))}
        {(view === "won" ? won : pipe).length === 0 ? (
          <li className="px-4 py-6 text-sm text-[var(--text-3)]">
            {view === "won"
              ? "Nothing won in the last 12 months yet. Record a deal to add one that wasn't written in Docs."
              : "Nothing sent and waiting on a decision."}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function DealRow({ href, title, client, meta, amount }: { href: string; title: string; client: string | null; meta: string; amount: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-1)]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--text-1)] group-hover:text-[var(--brand-700)]" title={title}>
            {title}
          </span>
          <span className="block truncate text-xs text-[var(--text-3)]" title={client ?? undefined}>
            {[client, meta].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-sm tabular-nums text-[var(--text-1)]">{amount}</span>
      </Link>
    </li>
  );
}

// ── The rules, in words ────────────────────────────────────────────────────────

function HowWorkedOut({ m }: { m: MoneySummary }) {
  const [copied, setCopied] = useState(false);
  const unconverted = Object.entries(m.unconverted);
  function copy() {
    const text = summaryText(m);
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  }
  return (
    <div className="flex flex-col gap-3 px-1 text-xs text-[var(--text-3)] sm:flex-row sm:items-start sm:justify-between">
      <details className="max-w-[720px]">
        <summary className="cursor-pointer select-none font-medium text-[var(--text-2)]">How these figures are worked out</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Each accepted or signed document with a costing block is a schedule: a role at a monthly rate earns that rate each month for its months, starting the month it was accepted. Any other line is earned once, that month.</li>
          <li>Values are after the document&apos;s discount and without VAT. This is what the documents commit to, not invoices.</li>
          <li>A proposal and a statement of work for the same job are both counted if both were accepted.</li>
          <li>A deal recorded by hand or from a file is saved as an accepted document labelled “Recorded deal”. Archive it in Docs to take it out.</li>
          <li>
            Other currencies are converted to {m.base} at the European Central Bank&apos;s rate
            {m.fxAsOf ? ` of ${new Date(m.fxAsOf).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}.
            {unconverted.length > 0
              ? ` No rate was available for ${unconverted.map(([c, v]) => formatMoney(v, c)).join(", ")}, so it's left out of the totals.`
              : ""}
          </li>
          <li>
            Team at rate card is what the developers on a client are worth at rate-card rates.
            {m.unpricedDevs > 0 ? ` ${m.unpricedDevs} developer${m.unpricedDevs === 1 ? " has" : "s have"} no rate and aren't in it.` : ""}
          </li>
        </ul>
      </details>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:border-[var(--brand-300)] hover:text-[var(--brand-700)]"
      >
        {copied ? <CheckIcon className="h-3.5 w-3.5 text-[var(--success-500)]" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy as an update"}
      </button>
    </div>
  );
}

/** A few lines Dan or Harry can paste into an investor update. */
export function summaryText(m: MoneySummary): string {
  const f = (v: number) => formatMoney(v, m.base);
  const change = m.monthChange == null ? "" : ` (${m.monthChange >= 0 ? "+" : ""}${Math.round(m.monthChange * 100)}% on last month)`;
  const top = m.clients.filter((c) => c.thisMonth > 0).slice(0, 3);
  return [
    `Revenue under contract this month: ${f(m.thisMonth)}${change}`,
    `Signed and still to bill: ${f(m.toCome)}`,
    `Won in the last 12 months: ${f(m.wonLast12)} across ${m.dealsLast12} ${m.dealsLast12 === 1 ? "deal" : "deals"}`,
    `Pipeline: ${f(m.pipeline)} across ${m.pipelineDeals} sent ${m.pipelineDeals === 1 ? "document" : "documents"}`,
    top.length ? `Largest this month: ${top.map((c) => `${c.name} ${f(c.thisMonth)}`).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
