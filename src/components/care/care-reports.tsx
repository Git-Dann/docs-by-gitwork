"use client";

import { ArrowPathIcon, ChevronDoubleLeftIcon, DocumentTextIcon, EyeIcon, PencilSquareIcon, PlusIcon, SparklesIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/motion/spinner";
import type { AnalyticsReportMetric, SupportClient, SupportReport, SupportReportPayload } from "@/types/support";
import { useCreateSupportReport, useDeleteSupportReport, useGenerateReportNarrative, useGenerateSupportReportDoc, useSupportConnections, useSupportReports, useCarePerformance, useUpdateSupportReport } from "@/hooks/use-support";
import { getCareStats } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { PerformanceStrip } from "./care-performance-strip";
import Link from "next/link";
import { TrendBadge } from "./care-shared";
import { careReportHref } from "@/lib/care-links";

// ─── reports view ────────────────────────────────────────────────────────────

function emptyPayload(author: string, forMonth?: Date): SupportReportPayload {
  // Default to previous month — when creating in June you're reporting on May
  const ref = forMonth ?? (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; })();
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return {
    author,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    overviewText: "",
    totalTickets: 0,
    catCancellations: 0,
    catAccountQueries: 0,
    catRefunds: 0,
    catTechIssues: 0,
    catOther: 0,
    prioUrgent: 0,
    prioHigh: 0,
    prioMedium: 0,
    prioLow: 0,
    performanceText: "",
    refundRequests: 0,
    refundsProcessed: 0,
    refundTotalValue: 0,
    refundNotes: "",
    metrics: [],
    summaryText: "",
  };
}

function numInput(
  label: string,
  value: number,
  onChange: (v: number) => void,
  prefix?: string,
  trend?: number,
) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">
        {label}
        {trend !== undefined && trend !== 0 && <TrendBadge delta={trend} />}
      </p>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm text-[var(--text-3)]">{prefix}</span>}
        <input
          type="number"
          min={0}
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
        />
      </div>
    </div>
  );
}

function textareaInput(
  label: string,
  value: string,
  onChange: (v: string) => void,
  placeholder: string,
  rows = 4,
) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">{label}</p>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-700)] focus:bg-white"
      />
    </div>
  );
}

function ReportBuilder({
  clientId,
  report,
  onSaved,
  onCancel,
}: {
  clientId: string;
  report: SupportReport | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { data: session } = useSession();
  const { canGenerateAi } = usePermissions(); // "Write narratives" spends tokens — admins by default
  const authorDefault = session?.user?.name ?? "";

  // Default period is previous month (May when viewing in June)
  const defaultMonthDate = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; })();
  const [period, setPeriod] = useState(
    report?.period ?? defaultMonthDate.toLocaleString("en-GB", { month: "long", year: "numeric" }),
  );
  const [p, setP] = useState<SupportReportPayload>(
    report?.payload ?? emptyPayload(authorDefault),
  );

  // Analytics API import — driven by the client's analytics connection (token lives
  // server-side on the connection, no more localStorage).
  const { data: connectionsData } = useSupportConnections(clientId);
  const analyticsConn = useMemo(
    () => (connectionsData?.connections ?? []).find((c) => c.source === "analytics") ?? null,
    [connectionsData],
  );
  const [fetchingApi, setFetchingApi] = useState(false);
  const [apiMsg, setApiMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [writingSummary, setWritingSummary] = useState(false);

  const metrics = p.metrics ?? [];

  async function handleWriteSummary() {
    setWritingSummary(true);
    setApiMsg(null);
    try {
      const res = await fetch(`/api/support/clients/${clientId}/analytics/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics, periodLabel: period }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: { narrative?: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? `AI: ${res.status}`);
      if (json.data?.narrative) {
        setP((prev) => ({ ...prev, analyticsNarrative: json.data!.narrative }));
        setApiMsg({ type: "ok", text: "Trend summary written." });
      }
    } catch (err) {
      setApiMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to write summary" });
    } finally {
      setWritingSummary(false);
    }
  }

  const generateNarrative = useGenerateReportNarrative(clientId);
  const { data: reportPerf } = useCarePerformance(clientId, p.periodStart, p.periodEnd);
  const [narrativeMsg, setNarrativeMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleWriteNarrative() {
    setNarrativeMsg(null);
    try {
      const res = await generateNarrative.mutateAsync({
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        periodLabel: period,
      });
      setP((prev) => ({
        ...prev,
        overviewText: res.overviewText || prev.overviewText,
        performanceText: res.performanceText || prev.performanceText,
        summaryText: res.summaryText || prev.summaryText,
      }));
      setNarrativeMsg({ type: "ok", text: `Narrative drafted from ${res.ticketCount} ticket${res.ticketCount === 1 ? "" : "s"} — review and edit before saving.` });
    } catch (err) {
      setNarrativeMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to generate narrative" });
    }
  }

  const createReport = useCreateSupportReport(clientId);
  const updateReport = useUpdateSupportReport(clientId);
  const saving = createReport.isPending || updateReport.isPending;

  function update<K extends keyof SupportReportPayload>(key: K, val: SupportReportPayload[K]) {
    setP((prev) => ({ ...prev, [key]: val }));
  }

  function updateMetric(index: number, patch: Partial<AnalyticsReportMetric>) {
    setP((prev) => {
      const next = [...(prev.metrics ?? [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, metrics: next };
    });
  }

  function addMetric() {
    setP((prev) => ({
      ...prev,
      metrics: [...(prev.metrics ?? []), { key: `m${Date.now()}`, label: "", value: 0, group: "Custom" }],
    }));
  }

  function removeMetric(index: number) {
    setP((prev) => ({ ...prev, metrics: (prev.metrics ?? []).filter((_, i) => i !== index) }));
  }

  function applyMonth(yyyyMm: string) {
    const [y, m] = yyyyMm.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const label = start.toLocaleString("en-GB", { month: "long", year: "numeric" });
    setPeriod(label);
    setP((prev) => ({
      ...prev,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
    }));
  }

  async function handleFetchFromApi() {
    setFetchingApi(true);
    setApiMsg(null);
    try {
      const month = p.periodStart.slice(0, 7); // YYYY-MM
      const res = await fetch(`/api/support/clients/${clientId}/analytics?month=${month}`);
      const json = await res.json().catch(() => ({})) as
        { data?: { periodLabel?: string; metrics?: AnalyticsReportMetric[] }; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Analytics API: ${res.status}`);

      const fetched = json.data?.metrics ?? [];
      if (fetched.length === 0) {
        setApiMsg({ type: "ok", text: `No metrics returned for ${month}. Check the connection in Connectors.` });
        return;
      }

      // Merge by key — keep manual overrides for keys not in the fetch, replace the rest.
      setP((prev) => {
        const existing = prev.metrics ?? [];
        const byKey = new Map(existing.map((m) => [m.key, m]));
        for (const m of fetched) byKey.set(m.key, m);
        return { ...prev, metrics: Array.from(byKey.values()) };
      });

      const changed = fetched.filter((m) => typeof m.previous === "number" && m.value !== m.previous).length;
      setApiMsg({
        type: "ok",
        text: `Fetched ${fetched.length} metric${fetched.length === 1 ? "" : "s"} for ${month}${changed > 0 ? ` · ${changed} changed vs last month` : ""}.`,
      });
    } catch (err) {
      setApiMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to fetch" });
    } finally {
      setFetchingApi(false);
    }
  }

  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    setApiMsg(null);
    try {
      const month = p.periodStart.slice(0, 7);
      const [statsRes, analyticsRes] = await Promise.allSettled([
        getCareStats(clientId, p.periodStart, p.periodEnd),
        analyticsConn
          ? fetch(`/api/support/clients/${clientId}/analytics?month=${month}`).then((r) => r.json() as Promise<{ data?: { metrics?: AnalyticsReportMetric[] }; error?: string }>)
          : Promise.resolve(null),
      ]);

      const stats = statsRes.status === "fulfilled" ? statsRes.value.stats : null;
      const analyticsMetrics = analyticsRes.status === "fulfilled" && analyticsRes.value
        ? (analyticsRes.value as { data?: { metrics?: AnalyticsReportMetric[] } }).data?.metrics ?? []
        : [];

      setP((prev) => {
        const next = { ...prev };
        if (stats) {
          next.totalTickets = stats.totalTickets;
          next.catCancellations = stats.catCancellations;
          next.catAccountQueries = stats.catAccountQueries;
          next.catRefunds = stats.catRefunds;
          next.catTechIssues = stats.catTechIssues;
          next.catOther = stats.catOther;
          next.prioUrgent = stats.prioUrgent;
          next.prioHigh = stats.prioHigh;
          next.prioMedium = stats.prioMedium;
          next.prioLow = stats.prioLow;
        }
        if (analyticsMetrics.length > 0) {
          const byKey = new Map((prev.metrics ?? []).map((m) => [m.key, m]));
          for (const m of analyticsMetrics) byKey.set(m.key, m);
          next.metrics = Array.from(byKey.values());
        }
        return next;
      });

      const parts: string[] = [];
      if (stats) parts.push(`${stats.totalTickets} ticket${stats.totalTickets === 1 ? "" : "s"}`);
      if (analyticsMetrics.length > 0) parts.push(`${analyticsMetrics.length} metric${analyticsMetrics.length === 1 ? "" : "s"}`);
      setApiMsg({ type: "ok", text: `Generated: ${parts.join(" · ")} pre-filled for ${month}.` });
    } catch (err) {
      setApiMsg({ type: "err", text: err instanceof Error ? err.message : "Failed to generate" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    // refundRequests / refundsProcessed are always equal to catCancellations — derive automatically
    const payload = { ...p, refundRequests: p.catCancellations, refundsProcessed: p.catCancellations };
    if (report) {
      await updateReport.mutateAsync({ reportId: report.id, data: { period, payload } });
    } else {
      await createReport.mutateAsync({ period, payload, createdBy: p.author });
    }
    onSaved();
  }

  const widgetHeader = (num: string, label: string, right?: React.ReactNode) => (
    <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
        {num} {"//"} {label}
      </span>
      {right ?? null}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* back + save bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
        >
          <ChevronDoubleLeftIcon className="h-4 w-4" />
          All reports
        </button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={generating}
            onClick={handleGenerate}
            title="Pre-fill ticket stats + analytics for this month"
          >
            <SparklesIcon className="h-3.5 w-3.5 mr-1" />
            {generating ? "Generating…" : "Generate"}
          </Button>
          {canGenerateAi && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={generateNarrative.isPending}
            onClick={() => void handleWriteNarrative()}
            title="AI-draft overview, performance, and summary narratives from triage data"
          >
            <SparklesIcon className="h-3.5 w-3.5 mr-1" />
            {generateNarrative.isPending ? "Writing…" : "Write narratives"}
          </Button>
          )}
          <Button type="button" variant="primary" size="sm" loading={saving} onClick={handleSave}>
            {report ? "Save changes" : "Save report"}
          </Button>
        </div>
      </div>

      {narrativeMsg && (
        <p className={`rounded-[6px] px-3 py-2 text-xs ${narrativeMsg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {narrativeMsg.type === "ok" ? "✓" : "✗"} {narrativeMsg.text}
        </p>
      )}

      {/* 01 // PERIOD & AUTHOR */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("01", "PERIOD & AUTHOR")}
        {/* Month quick-pick */}
        <div className="flex items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-5 py-2.5">
          <span className="text-[11px] font-medium text-[var(--text-3)]">Quick-select month</span>
          <select
            value={`${p.periodStart.slice(0, 7)}`}
            onChange={(e) => applyMonth(e.target.value)}
            className="app-select-compact h-7 !min-h-0 w-auto bg-white text-xs"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              const label = d.toLocaleString("en-GB", { month: "long", year: "numeric" });
              return <option key={val} value={val}>{label}</option>;
            })}
          </select>
          <span className="text-[11px] text-[var(--text-4)]">Sets all date fields + label below</span>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">Period label</p>
            <input
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="April 2026"
              className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">Period start</p>
            <input
              type="date"
              value={p.periodStart}
              onChange={(e) => update("periodStart", e.target.value)}
              className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">Period end</p>
            <input
              type="date"
              value={p.periodEnd}
              onChange={(e) => update("periodEnd", e.target.value)}
              className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
            />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">Author</p>
            <input
              type="text"
              value={p.author}
              onChange={(e) => update("author", e.target.value)}
              placeholder="Name / Customer Support Specialist"
              className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* 02 // OVERVIEW */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("02", "OVERVIEW")}
        <div className="p-5">
          {textareaInput("Overview narrative", p.overviewText, (v) => update("overviewText", v),
            "Write 3–4 bullet points summarising the month's support activity…", 5)}
        </div>
      </div>

      {/* 03 // TICKET VOLUME BY CATEGORY */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("03", "TICKET VOLUME BY CATEGORY")}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {numInput("Total tickets", p.totalTickets, (v) => update("totalTickets", v))}
            {numInput("Cancellations", p.catCancellations, (v) => update("catCancellations", v))}
            {numInput("Account queries", p.catAccountQueries, (v) => update("catAccountQueries", v))}
            {numInput("Refunds", p.catRefunds, (v) => update("catRefunds", v))}
            {numInput("Tech issues", p.catTechIssues, (v) => update("catTechIssues", v))}
            {numInput("Other", p.catOther, (v) => update("catOther", v))}
          </div>
        </div>
      </div>

      {/* 04 // SUPPORT PERFORMANCE */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("04", "SUPPORT PERFORMANCE")}
        <div className="space-y-4 p-5">
          {reportPerf?.metrics && (
            <div className="space-y-2">
              <p className="text-[11px] text-[var(--text-4)]">
                Computed live from ticket timestamps for this period — graded against industry benchmarks
                (first reply &lt;1h best-in-class, resolution rate 80%+ strong).
              </p>
              <PerformanceStrip metrics={reportPerf.metrics} />
            </div>
          )}
          {textareaInput("Performance notes", p.performanceText, (v) => update("performanceText", v),
            "Comment on resolution rate, backlog, SLA adherence…", 4)}
        </div>
      </div>

      {/* 05 // REFUND REQUESTS */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("05", "REFUND REQUESTS")}
        <div className="p-5 space-y-4">
          <p className="text-xs text-[var(--text-4)]">
            Refund count is derived from cancellations above — enter the total £ value and any notes.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {numInput("Total value (£)", p.refundTotalValue, (v) => update("refundTotalValue", v), "£")}
          </div>
          {textareaInput("Breakdown notes", p.refundNotes, (v) => update("refundNotes", v),
            "e.g. 4 × £6.99 monthly (duplicate sub), 1 × £69.99 yearly…", 3)}
        </div>
      </div>

      {/* 06 // ANALYTICS */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("06", "ANALYTICS", (
          analyticsConn ? (
            <button
              type="button"
              onClick={() => void handleFetchFromApi()}
              disabled={fetchingApi}
              className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-700)] transition hover:bg-[var(--mist)] disabled:opacity-50"
            >
              {fetchingApi ? (
                <Spinner tone="brand" />
              ) : (
                <ArrowPathIcon className="h-3 w-3" />
              )}
              {fetchingApi ? "Fetching…" : `Fetch ${p.periodStart.slice(0, 7)}`}
            </button>
          ) : null
        ))}

        {/* connection status / hint */}
        <div className="border-b border-[var(--border-2)] bg-[var(--surface-1)] px-5 py-3 space-y-1.5">
          {analyticsConn ? (
            <p className="text-[11px] text-[var(--text-3)]">
              Pulling from <span className="font-semibold text-[var(--text-1)]">{analyticsConn.label}</span> for{" "}
              <span className="font-mono">{p.periodStart.slice(0, 7)}</span>. Use the month picker above to change the period —
              trends compare against the previous month automatically.
            </p>
          ) : (
            <p className="text-[11px] text-[var(--text-4)]">
              No analytics API connected. Add an <span className="font-medium text-[var(--text-3)]">Analytics API</span> connector
              in <span className="font-medium text-[var(--text-3)]">Connectors</span> to auto-fill these figures, or add metrics manually below.
            </p>
          )}
          {apiMsg && (
            <p className={`text-[11px] ${apiMsg.type === "ok" ? "text-emerald-600" : "text-red-500"}`}>
              {apiMsg.type === "ok" ? "✓" : "✗"} {apiMsg.text}
            </p>
          )}
        </div>

        <div className="p-5 space-y-5">
          {metrics.length === 0 && (
            <p className="text-xs text-[var(--text-4)]">
              No metrics yet. {analyticsConn ? "Click “Fetch” above" : "Add one manually"} to populate this section.
            </p>
          )}

          {/* grouped metric cards */}
          {Array.from(new Set(metrics.map((m) => m.group ?? "Metrics"))).map((groupName) => (
            <div key={groupName}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-4)]">{groupName}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {metrics.map((m, i) => (m.group ?? "Metrics") !== groupName ? null : (
                  <div key={m.key} className="group relative">
                    <div className="mb-1 flex items-center gap-1">
                      <input
                        value={m.label}
                        onChange={(e) => updateMetric(i, { label: e.target.value })}
                        placeholder="Metric label"
                        className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-[var(--text-3)] outline-none focus:text-[var(--text-1)]"
                      />
                      {typeof m.previous === "number" && m.value !== m.previous && (
                        <TrendBadge delta={m.value - m.previous} previous={m.previous} />
                      )}
                      <button
                        type="button"
                        onClick={() => removeMetric(i)}
                        className="shrink-0 text-[var(--text-4)] opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                        title="Remove metric"
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      {m.unit && <span className="text-sm text-[var(--text-3)]">{m.unit}</span>}
                      <input
                        type="number"
                        value={m.value || ""}
                        onChange={(e) => updateMetric(i, { value: Number(e.target.value) || 0 })}
                        className="h-8 w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
                      />
                    </div>
                    {typeof m.previous === "number" && (
                      <p className="mt-0.5 text-[10px] text-[var(--text-4)]">prev: {m.previous.toLocaleString()}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addMetric}
            className="flex items-center gap-1.5 rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add metric
          </button>

          {/* AI trend narrative — "Subscribers up 12% (+142)…" */}
          {metrics.length > 0 && (
            <div className="border-t border-[var(--border-2)] pt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-medium text-[var(--text-3)]">Trend summary</label>
                <button
                  type="button"
                  onClick={() => void handleWriteSummary()}
                  disabled={writingSummary}
                  className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-700)] transition hover:bg-[var(--mist)] disabled:opacity-50"
                >
                  {writingSummary ? (
                    <Spinner tone="brand" />
                  ) : (
                    <SparklesIcon className="h-3 w-3" />
                  )}
                  {writingSummary ? "Writing…" : "Write summary"}
                </button>
              </div>
              <textarea
                value={p.analyticsNarrative ?? ""}
                onChange={(e) => update("analyticsNarrative", e.target.value)}
                placeholder="One-paragraph trend summary — click “Write summary” to draft from the metrics above, or write your own."
                rows={3}
                className="w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* 07 // SUMMARY */}
      <div className="app-card overflow-hidden p-0">
        {widgetHeader("07", "SUMMARY")}
        <div className="p-5">
          {textareaInput("Summary narrative", p.summaryText, (v) => update("summaryText", v),
            "Write the closing summary bullet points for the report…", 5)}
        </div>
      </div>

      {/* bottom save */}
      <div className="flex justify-end pb-4">
        <Button type="button" variant="primary" size="sm" loading={saving} onClick={handleSave}>
          {report ? "Save changes" : "Save report"}
        </Button>
      </div>
    </div>
  );
}

export function ReportsView({ client }: { client: SupportClient }) {
  const router = useRouter();
  const { data: reportsData, isLoading } = useSupportReports(client.id);
  const deleteReport = useDeleteSupportReport(client.id);
  const generateDoc = useGenerateSupportReportDoc(client.id);
  const reports = reportsData?.reports ?? [];

  const [editing, setEditing] = useState<SupportReport | null | "new">(null);
  const [genError, setGenError] = useState<string | null>(null);

  // One-click: pull last month's live data and open a shareable Docs report.
  async function handleGenerateDoc() {
    setGenError(null);
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const periodLabel = start.toLocaleString("en-GB", { month: "long", year: "numeric" });
    try {
      const { documentId } = await generateDoc.mutateAsync({
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
        periodLabel,
      });
      router.push(`/app/docs/${documentId}`);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Failed to generate report");
    }
  }

  const hasAllocation = client.supportDaysPerMonth != null;
  const used = client.supportDaysUsed ?? 0;
  const total = client.supportDaysPerMonth ?? 0;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });

  if (editing !== null) {
    return (
      <ReportBuilder
        clientId={client.id}
        report={editing === "new" ? null : editing}
        onSaved={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {hasAllocation && (
        <div className="app-card overflow-hidden p-0">
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
              01 // SUPPORT DAYS
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-4)]">
              {month}
            </span>
          </div>
          <div className="p-5">
            <div className="mt-1 flex items-end gap-4">
              <p className="font-display text-[32px] leading-none text-[var(--text-1)]">
                {used}
                <span className="text-[18px] text-[var(--text-3)]">/{total}</span>
              </p>
              <p className="mb-1 text-sm text-[var(--text-4)]">{pct}% used</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-1)]">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct > 90 ? "bg-red-400" : pct > 60 ? "bg-amber-400" : "bg-[var(--brand-700)]",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text-4)]">
              {total - used} days remaining · Report due{" "}
              {client.reportDueDay ? `day ${client.reportDueDay}` : "monthly"}
              {client.reportingRecipient && ` → ${client.reportingRecipient}`}
            </p>
          </div>
        </div>
      )}

      {/* One-click customer report — pulls live data into a shareable Docs document. */}
      <div className="app-card overflow-hidden p-0">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-1)]">Customer report</p>
            <p className="mt-0.5 text-xs text-[var(--text-4)]">
              Pulls last month&apos;s tickets &amp; analytics into a branded, shareable document in the Docs builder — edit, share a link, or export PDF.
            </p>
            {genError && <p className="mt-1.5 text-xs text-red-500">{genError}</p>}
          </div>
          <button
            type="button"
            onClick={() => void handleGenerateDoc()}
            disabled={generateDoc.isPending}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
          >
            <DocumentTextIcon className="h-4 w-4" />
            {generateDoc.isPending ? "Generating…" : "Generate customer report"}
          </button>
        </div>
      </div>

      <div className="app-card overflow-hidden p-0">
        <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
            02 // SAVED REPORTS (LEGACY)
          </span>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)] transition hover:bg-[var(--mist)] hover:text-[var(--brand-700)]"
          >
            <PlusIcon className="h-3 w-3" />
            New (old builder)
          </button>
        </div>
        {isLoading && <div className="h-20 animate-pulse bg-[var(--surface-1)]" />}
        {!isLoading && reports.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <DocumentTextIcon className="h-8 w-8 text-[var(--text-4)]" />
            <p className="text-sm text-[var(--text-4)]">No reports yet</p>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--mist)]"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Build first report
            </button>
          </div>
        )}
        {reports.map((r, idx) => (
          <div
            key={r.id}
            className={cn("flex items-center justify-between px-5 py-3.5", idx > 0 && "border-t border-[var(--border-2)]")}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-1)]">{r.period}</p>
              <p className="mt-0.5 text-xs text-[var(--text-4)]">
                {r.payload.periodStart && r.payload.periodEnd
                  ? `${r.payload.periodStart} → ${r.payload.periodEnd}`
                  : `Created ${new Date(r.createdAt).toLocaleDateString("en-GB")}`}
                {r.payload.author ? ` · ${r.payload.author}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.payload.totalTickets > 0 && (
                <span className="rounded-md border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-3)]">
                  {r.payload.totalTickets} tickets
                </span>
              )}
              <Link
                href={careReportHref(r.id)}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--mist)] hover:text-[var(--brand-700)]"
                title="Preview report"
              >
                <EyeIcon className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setEditing(r)}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--mist)] hover:text-[var(--brand-700)]"
                title="Edit report"
              >
                <PencilSquareIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => deleteReport.mutate(r.id)}
                disabled={deleteReport.isPending}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                title="Delete report"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
