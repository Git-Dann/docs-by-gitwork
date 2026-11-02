"use client";

import { Fragment, useMemo, useState } from "react";
import { ChatBubbleLeftRightIcon, ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { StatTile, TrendBadge, WidgetCard } from "@/components/analytics/analytics-widgets";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/motion/spinner";
import { useAiAnswersReport, useSaveAiAnswersConfig, useStartAiAnswersRun } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatRelative } from "@/lib/format";
import { changeBetween } from "@/lib/ai-search";
import {
  AI_ANSWER_CAVEATS,
  AI_ANSWER_LIMITS,
  AI_ENGINES,
  comparableSummaries,
  engineLabel,
  hostOfUrl,
  summariseRun,
  type AiAnswersReport,
  type AiEngineId,
  type AnswerResult,
  type AnswerRun,
} from "@/lib/ai-answers";

/**
 * Pulse → AI search: what AI assistants say when buyers ask them. Every tick is backed by the
 * answer it came from, which opens under the question. An answer that couldn't be asked is
 * shown as such and kept out of every figure.
 */
export function AiAnswersCard({ number }: { number: string }) {
  const query = useAiAnswersReport();
  const report = query.data;
  const start = useStartAiAnswersRun();
  const { isAdminOrAbove } = usePermissions();
  const [editing, setEditing] = useState(false);

  const canAsk = report ? report.engines.some((e) => e.available) && report.config.questions.length > 0 : false;
  const running = report?.running ?? null;

  return (
    <WidgetCard
      number={number}
      label="Buyer questions"
      status={report?.latest ? `asked ${formatRelative(report.latest.startedAt)}` : undefined}
      hint="Questions a buyer might ask an AI assistant, put to ChatGPT, Claude, Perplexity and Gemini with web search on. Each answer is checked for our name and for links to our site."
    >
      {query.isError ? (
        <p className="text-sm text-[var(--danger-500)]">{(query.error as Error).message}</p>
      ) : !report ? (
        <p className="text-sm text-[var(--text-3)]">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RunLine report={report} />
            <div className="flex flex-wrap items-center gap-2">
              {isAdminOrAbove ? (
                <Button size="sm" variant="tertiary" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                  {editing ? "Close setup" : "Edit questions"}
                </Button>
              ) : null}
              {isAdminOrAbove ? (
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
                  loading={start.isPending}
                  disabled={!canAsk || !!running}
                  title={!canAsk ? "Add a question and at least one assistant's API key first." : undefined}
                  onClick={() => start.mutate()}
                >
                  {running ? "Asking…" : "Ask now"}
                </Button>
              ) : null}
            </div>
          </div>
          {start.isError ? (
            <p role="alert" className="text-sm text-[var(--danger-500)]">
              Didn&apos;t start: {(start.error as Error).message}
            </p>
          ) : null}

          {editing && isAdminOrAbove ? <AnswersSetup report={report} onSaved={() => setEditing(false)} /> : null}

          {report.latest ? (
            <Results report={report} latest={report.latest} />
          ) : (
            <NoRunYet report={report} />
          )}
        </div>
      )}
    </WidgetCard>
  );
}

function RunLine({ report }: { report: AiAnswersReport }) {
  const running = report.running;
  if (running) {
    const total = running.questions.length * running.engines.length;
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-2)]">
        <Spinner size="sm" />
        Asking {running.engines.length} assistant{running.engines.length === 1 ? "" : "s"}: {running.results.length} of {total} answers
        so far. You can leave this page.
      </p>
    );
  }
  const latest = report.latest;
  return (
    <p className="text-sm text-[var(--text-3)]">
      {latest ? (
        <>
          Last asked {new Date(latest.startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          {latest.status === "interrupted" ? " (cut short: the server restarted, so some answers are missing)" : ""}.
        </>
      ) : (
        "Not asked yet."
      )}{" "}
      {report.nextAutoRunAt
        ? `Next weekly run ${Date.parse(report.nextAutoRunAt) <= Date.now() ? "starts within a minute" : formatRelative(report.nextAutoRunAt)}.`
        : report.config.saved
          ? "Weekly asking is off."
          : "Save the questions to have them asked every week."}
    </p>
  );
}

function NoRunYet({ report }: { report: AiAnswersReport }) {
  return (
    <div className="space-y-3">
      <EngineList report={report} />
      <p className="text-sm text-[var(--text-3)]">
        {report.config.questions.length} question{report.config.questions.length === 1 ? "" : "s"} ready
        {report.config.saved ? "" : " (the built-in examples)"}. Press Ask now to put them to every assistant listed as ready.
      </p>
    </div>
  );
}

function EngineList({ report }: { report: AiAnswersReport }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {report.engines.map((e) => (
        <li key={e.engine} className="flex items-start gap-2 text-sm">
          <span
            aria-hidden
            className={cn("widget-status-dot mt-1.5 shrink-0", e.available ? "widget-status-dot--success" : e.enabled ? "widget-status-dot--warning" : "")}
          />
          <span className="min-w-0">
            <span className="font-medium text-[var(--text-1)]">{e.label}</span>
            <span className="text-[var(--text-3)]">{e.available ? ` · ready (${e.model})` : ` · ${e.reason}`}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function OfTotal({ n, of }: { n: number; of: number }) {
  return (
    <>
      {n}
      <span style={{ fontSize: 18 }} className="text-[var(--text-4)]">{` of ${of}`}</span>
    </>
  );
}

function Results({ report, latest }: { report: AiAnswersReport; latest: AnswerRun }) {
  const summary = useMemo(() => summariseRun(latest.results), [latest]);
  const compared = useMemo(
    () => (report.previous ? comparableSummaries(latest.results, report.previous.results) : null),
    [latest, report.previous],
  );
  const previousLine = (pick: (s: ReturnType<typeof summariseRun>) => [number, number]) => {
    if (!compared) return report.previous ? "Previous run asked different questions" : "First run";
    const [n, of] = pick(compared.previous);
    return `Previous run ${n} of ${of}, on the ${compared.sharedQuestions} question${compared.sharedQuestions === 1 ? "" : "s"} both asked`;
  };
  const trend = (pick: (s: ReturnType<typeof summariseRun>) => number) =>
    compared ? <TrendBadge delta={changeBetween(pick(compared.latest), pick(compared.previous))} /> : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          figure={
            <span className="inline-flex flex-wrap items-baseline gap-x-2">
              <span>
                <OfTotal n={summary.questionsShownUp} of={summary.questionsAnswered} />
              </span>
              {trend((s) => s.questionsShownUp)}
            </span>
          }
          label="Buyer questions where Gitwork shows up"
          sub={previousLine((s) => [s.questionsShownUp, s.questionsAnswered])}
        />
        <StatTile
          figure={
            <span className="inline-flex flex-wrap items-baseline gap-x-2">
              <span>
                <OfTotal n={summary.answersNamedOrCited} of={summary.answers} />
              </span>
              {trend((s) => s.answersNamedOrCited)}
            </span>
          }
          label="AI answers that name or cite Gitwork"
          sub={`${summary.answersNamed} name us, ${summary.answersCited} cite our site. ${previousLine((s) => [s.answersNamedOrCited, s.answers])}`}
        />
      </div>
      {summary.failed > 0 ? (
        <p className="text-sm text-[var(--warning-500)]">
          {summary.failed} answer{summary.failed === 1 ? "" : "s"} couldn&apos;t be asked and {summary.failed === 1 ? "is" : "are"} left out of these
          figures. The reasons are under each question.
        </p>
      ) : null}

      <EngineTable report={report} latest={latest} />
      <QuestionsTable latest={latest} />

      <ul className="space-y-1 text-xs text-[var(--text-4)]">
        {AI_ANSWER_CAVEATS.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

const th = "px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]";
const td = "px-3 py-2 align-top border-t border-[var(--border-2)] text-sm";

function EngineTable({ report, latest }: { report: AiAnswersReport; latest: AnswerRun }) {
  const summary = summariseRun(latest.results);
  const notAsked = report.engines.filter((e) => !latest.engines.includes(e.engine));
  return (
    <div className="overflow-x-auto rounded-[8px] border border-[var(--border-2)]">
      <table className="w-full min-w-[520px]">
        <thead>
          <tr>
            <th className={th}>Assistant</th>
            <th className={cn(th, "text-right")}>Name or cite us</th>
            <th className={cn(th, "text-right")}>Name us</th>
            <th className={cn(th, "text-right")}>Cite our site</th>
            <th className={cn(th, "text-right")}>Couldn&apos;t ask</th>
          </tr>
        </thead>
        <tbody>
          {summary.byEngine.map((e) => (
            <tr key={e.engine}>
              <td className={td}>{engineLabel(e.engine)}</td>
              <td className={cn(td, "text-right tabular-nums")}>
                {e.answered ? `${e.namedOrCited} of ${e.answered}` : "—"}
              </td>
              <td className={cn(td, "text-right tabular-nums")}>{e.answered ? e.named : "—"}</td>
              <td className={cn(td, "text-right tabular-nums")}>{e.answered ? e.cited : "—"}</td>
              <td className={cn(td, "text-right tabular-nums", e.failed > 0 && "text-[var(--warning-500)]")}>{e.failed || "—"}</td>
            </tr>
          ))}
          {notAsked.map((e) => (
            <tr key={e.engine}>
              <td className={cn(td, "text-[var(--text-3)]")}>{e.label}</td>
              <td className={cn(td, "text-[var(--text-4)]")} colSpan={4}>
                Not asked in this run. {e.reason ?? "Ready for the next run."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Verdict({ r }: { r: AnswerResult | undefined }) {
  if (!r) return <span className="text-[var(--text-4)]">—</span>;
  if (r.status !== "ok")
    return (
      <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--warning-500)]" title={r.error ?? undefined}>
        Couldn&apos;t ask
      </span>
    );
  if (r.named && r.cited) return <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--success-500)]">Named + cited</span>;
  if (r.named) return <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--success-500)]">Named</span>;
  if (r.cited) return <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--success-500)]">Cited</span>;
  return <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--text-4)]">Not mentioned</span>;
}

function QuestionsTable({ latest }: { latest: AnswerRun }) {
  const [open, setOpen] = useState<string | null>(null);
  const engines = latest.engines;
  const byQuestion = useMemo(() => {
    const m = new Map<string, Map<AiEngineId, AnswerResult>>();
    for (const r of latest.results) {
      if (!m.has(r.questionId)) m.set(r.questionId, new Map());
      m.get(r.questionId)!.set(r.engine, r);
    }
    return m;
  }, [latest]);

  return (
    <div className="overflow-x-auto rounded-[8px] border border-[var(--border-2)]">
      <table className="w-full min-w-[720px] table-fixed">
        <thead>
          <tr>
            <th className={cn(th, "w-[40%]")}>Question</th>
            {engines.map((e) => (
              <th key={e} className={th}>
                {engineLabel(e)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {latest.questions.map((q) => {
            const answers = byQuestion.get(q.id);
            const isOpen = open === q.id;
            return (
              <Fragment key={q.id}>
                <tr className="cursor-pointer hover:bg-[var(--surface-1)]" onClick={() => setOpen(isOpen ? null : q.id)}>
                  <td className={td}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-1.5 text-left text-[var(--text-1)]"
                      aria-expanded={isOpen}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(isOpen ? null : q.id);
                      }}
                    >
                      {isOpen ? (
                        <ChevronDownIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
                      ) : (
                        <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
                      )}
                      <span>{q.text}</span>
                    </button>
                  </td>
                  {engines.map((e) => (
                    <td key={e} className={td}>
                      <Verdict r={answers?.get(e)} />
                    </td>
                  ))}
                </tr>
                {isOpen ? (
                  <tr>
                    <td colSpan={engines.length + 1} className="border-t border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-3">
                      <div className="grid gap-3 lg:grid-cols-2">
                        {engines.map((e) => (
                          <AnswerDetail key={e} engine={e} r={answers?.get(e)} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AnswerDetail({ engine, r }: { engine: AiEngineId; r: AnswerResult | undefined }) {
  return (
    <div className="min-w-0 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-3)]">
          {engineLabel(engine)}
          {r ? ` · ${r.model}` : ""}
        </span>
        <Verdict r={r} />
      </div>
      {!r ? (
        <p className="text-sm text-[var(--text-4)]">Not asked in this run.</p>
      ) : r.status !== "ok" ? (
        <p className="text-sm text-[var(--warning-500)]">{r.error}</p>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-sm text-[var(--text-2)]">{r.excerpt}</p>
          {r.ourSources.length ? (
            <p className="mt-2 text-xs text-[var(--text-3)]">
              Our pages cited:{" "}
              {r.ourSources.map((u, i) => (
                <Fragment key={u}>
                  {i ? ", " : ""}
                  <a className="break-all text-[var(--brand-600)] underline" href={u} target="_blank" rel="noreferrer noopener">
                    {u}
                  </a>
                </Fragment>
              ))}
            </p>
          ) : null}
          {r.sources.length ? (
            <p className="mt-1 break-words text-xs text-[var(--text-4)]">
              Sources: {r.sources.slice(0, 8).map((s) => s.title || hostOfUrl(s.url) || s.url).join(" · ")}
              {r.sources.length > 8 ? ` · and ${r.sources.length - 8} more` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--text-4)]">No sources given.</p>
          )}
        </>
      )}
    </div>
  );
}

function splitList(v: string): string[] {
  return v
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function AnswersSetup({ report, onSaved }: { report: AiAnswersReport; onSaved: () => void }) {
  const save = useSaveAiAnswersConfig();
  const c = report.config;
  const [questions, setQuestions] = useState(c.questions.map((q) => q.text).join("\n"));
  const [brands, setBrands] = useState(c.brandNames.join(", "));
  const [domains, setDomains] = useState(c.domains.join(", "));
  const [engines, setEngines] = useState<AiEngineId[]>(c.engines);
  const [weekly, setWeekly] = useState(c.autoWeekly);
  const lines = questions.split("\n").map((q) => q.trim()).filter(Boolean);

  return (
    <form
      className="space-y-4 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          { questions: lines, brandNames: splitList(brands), domains: splitList(domains), engines, autoWeekly: weekly },
          { onSuccess: onSaved },
        );
      }}
    >
      {!c.saved ? (
        <p className="text-sm text-[var(--text-2)]">
          These are example questions to start from. Change them to what your buyers actually ask, then save.
        </p>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">
          Questions, one per line ({lines.length} of {AI_ANSWER_LIMITS.maxQuestions})
        </span>
        <textarea
          className="app-input min-h-[220px] w-full px-3 py-2 text-[16px] sm:text-sm"
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Names that count as a mention</span>
          <input className="app-input w-full text-[16px] sm:text-sm" value={brands} onChange={(e) => setBrands(e.target.value)} placeholder="Gitwork" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Domains that count as a citation</span>
          <input
            className="app-input w-full text-[16px] sm:text-sm"
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="gitwork.co.uk"
          />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-[var(--text-2)]">Assistants to ask</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {AI_ENGINES.map(({ id, label }) => {
            const a = report.engines.find((e) => e.engine === id);
            return (
              <label key={id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={engines.includes(id)}
                  onChange={(e) => setEngines((xs) => (e.target.checked ? [...xs, id] : xs.filter((x) => x !== id)))}
                />
                <span>
                  <span className="text-[var(--text-1)]">{label}</span>
                  {a && !a.available && a.enabled ? <span className="text-[var(--text-3)]"> · {a.reason}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-[var(--text-1)]">
        <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
        Ask again every week
      </label>
      {save.isError ? <p className="text-sm text-[var(--danger-500)]">{(save.error as Error).message}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="primary" loading={save.isPending}>
          Save
        </Button>
        <p className="text-xs text-[var(--text-4)]">
          Each run is {lines.length * Math.max(1, engines.length)} paid AI calls with web search.
        </p>
      </div>
    </form>
  );
}
