"use client";

/**
 * Drafts the weekly client update (the Friday email), in the house two-column popup: the draft on
 * the left to edit, what it was written from on the right to check. Nothing is sent from here:
 * Copy, or Open in Gmail with the draft filled in. Rules in src/lib/weekly-update.ts.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowPathIcon, CheckIcon, ClipboardDocumentIcon, EnvelopeIcon, GlobeAltIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { draftWeeklyUpdateApi, publishWikiUpdateApi } from "@/lib/api";
import { gmailComposeUrl, quietWeek, type WeeklyFacts, type WeeklyUpdateResult } from "@/lib/weekly-update";

const MONO = { fontFamily: "var(--font-mono)" } as const;

export function WeeklyUpdateDialog({
  open,
  onClose,
  slug,
  clientName,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  clientName: string;
}) {
  const [week, setWeek] = useState<"this" | "last">("this");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<WeeklyUpdateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const draft = useMutation({
    mutationFn: (opts: { week: "this" | "last"; regenerate?: boolean }) => draftWeeklyUpdateApi(slug, opts),
    onSuccess: (r) => {
      setResult(r);
      setSubject(r.draft.subject);
      setBody(r.draft.body);
    },
  });
  const { mutate } = draft;

  // Publishing puts the words, as written here, on the client's wiki (Updates, CLAUDE.md §147).
  const qc = useQueryClient();
  const [published, setPublished] = useState(false);
  const publish = useMutation({
    mutationFn: () => publishWikiUpdateApi(slug, { weekStart: result!.week.start, subject, body }),
    onSuccess: () => {
      setPublished(true);
      void qc.invalidateQueries({ queryKey: ["wiki-updates", slug] });
      void qc.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
  // A changed draft or another week is a new thing to publish.
  useEffect(() => setPublished(false), [subject, body, week]);

  // Draft when opened and when the week changes.
  useEffect(() => {
    if (open) mutate({ week });
  }, [open, week, mutate]);

  function copy() {
    void navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  }

  const to = result?.to ?? [];
  const busy = draft.isPending;

  return (
    <Modal open={open} onClose={onClose} title={`Weekly update · ${clientName}`} panelClassName="app-dialog-fixed w-full max-w-5xl">
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_300px] md:overflow-hidden">
        {/* The draft */}
        <div className="flex flex-col gap-3 p-4 md:min-h-0 md:overflow-y-auto">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]" style={MONO}>
              Subject
            </span>
            <input
              className="app-input w-full text-base sm:text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy && !result}
            />
          </label>
          <label className="flex min-h-[320px] flex-1 flex-col">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]" style={MONO}>
              Email
            </span>
            {busy && !result ? (
              <div className="space-y-2 rounded-[6px] border border-[var(--border-1)] p-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <textarea
                className="app-input min-h-[320px] w-full flex-1 resize-none px-3 py-2.5 text-base leading-relaxed sm:text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-busy={busy}
              />
            )}
          </label>
        </div>

        {/* What it was written from */}
        <aside className="flex flex-col gap-4 border-t border-[var(--border-1)] bg-[var(--surface-1)] p-4 md:min-h-0 md:overflow-y-auto md:border-l md:border-t-0">
          <Segmented
            label="Which week"
            value={week}
            onChange={(v) => setWeek(v)}
            options={[
              { value: "this", label: "This week" },
              { value: "last", label: "Last week" },
            ]}
          />
          {draft.isError ? (
            <p className="text-sm text-[var(--danger-500)]">{(draft.error as Error).message}</p>
          ) : result ? (
            <>
              <p className="flex items-start gap-2 text-xs text-[var(--text-2)]">
                <SparklesIcon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
                <span>
                  {result.source === "ai"
                    ? `Written by AI from the facts below${result.cached ? " (saved draft)" : ""}. Check every line before you send it.`
                    : result.reason}
                </span>
              </p>
              <button
                type="button"
                onClick={() => draft.mutate({ week, regenerate: true })}
                className="app-button app-button-secondary app-button-xs self-start"
                disabled={busy}
              >
                <ArrowPathIcon className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                Write it again
              </button>
              <Facts facts={result.facts} />
              {result.failed.length > 0 ? (
                <p className="text-xs text-[var(--text-2)]">Couldn&apos;t read {result.failed.join(", ")}, so check the email covers it.</p>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border-1)] px-4 py-3">
        <p className="min-w-0 truncate text-xs text-[var(--text-3)]" title={publish.isError ? (publish.error as Error).message : to.join(", ")}>
          {publish.isError ? (
            <span className="text-[var(--danger-500)]">{(publish.error as Error).message}</span>
          ) : to.length ? (
            `To ${to.join(", ")}`
          ) : (
            "No contact email on this client yet. Add one in Edit client."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => publish.mutate()}
            className="app-button app-button-secondary app-button-sm"
            disabled={!body || !result || publish.isPending}
            title="Show this update to the client in their wiki, under Updates"
          >
            {published ? <CheckIcon className="h-4 w-4 text-[var(--success-500)]" /> : <GlobeAltIcon className="h-4 w-4" />}
            {published ? "On their wiki" : publish.isPending ? "Publishing…" : "Publish to wiki"}
          </button>
          <button type="button" onClick={copy} className="app-button app-button-secondary app-button-sm" disabled={!body}>
            {copied ? <CheckIcon className="h-4 w-4 text-[var(--success-500)]" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={body ? gmailComposeUrl(to, { subject, body }) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!body}
            className="app-button app-button-primary app-button-sm"
          >
            <EnvelopeIcon className="h-4 w-4" />
            Open in Gmail
          </a>
        </div>
      </div>
    </Modal>
  );
}

function Facts({ facts }: { facts: WeeklyFacts }) {
  const rows: Array<[string, string[]]> = [
    ["Released", facts.shipped.map((s) => s.title)],
    ["Finished", facts.done.flatMap((g) => g.items.map((i) => (g.group ? `${g.group}: ${i.title}` : i.title)))],
    ["Outages", facts.outages.map((o) => `${o.title}${o.detail ? ` (${o.detail})` : ""}`)],
    ["Meetings", facts.meetings.map((m) => m.title)],
    ["In progress", facts.inProgress.map((i) => i.title)],
    ["Up next", facts.upNext.map((i) => i.title)],
    ["Needed from them", facts.needFromYou.map((n) => `${n.title}: ${n.need}`)],
  ];
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]" style={MONO}>
        Written from
      </h3>
      {quietWeek(facts) ? <p className="text-xs text-[var(--text-3)]">Nothing was finished, released or held this week.</p> : null}
      {rows
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => (
          <div key={label}>
            <p className="text-xs font-medium text-[var(--text-2)]">
              {label} <span className="font-normal text-[var(--text-4)]">{items.length}</span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {items.slice(0, 8).map((i, n) => (
                <li key={n} className="text-xs text-[var(--text-3)]">
                  {i}
                </li>
              ))}
              {items.length > 8 ? <li className="text-xs text-[var(--text-4)]">and {items.length - 8} more</li> : null}
            </ul>
          </div>
        ))}
    </div>
  );
}
