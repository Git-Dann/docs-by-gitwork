"use client";

import { useState } from "react";
import { LinkIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useClientList } from "@/hooks/use-proposals";
import { useAddWikiLink, useRemoveWikiLink, useWikiLinks } from "@/hooks/use-wiki-links";

/**
 * `05 // LINKED CLIENTS` — other clients whose delivery work shows on this wiki.
 *
 * A big workstream often ends up as its own client record — YourGroop's
 * intelligence engine is the case this was built for — while the people reading
 * YourGroop's wiki still need to see it next to the rest. Linking merges the
 * other client's feature blocks, tasks and milestones into this wiki's timeline,
 * each row labelled with where it came from.
 *
 * ⚠️ The copy says "one way" because it IS, and the reason is disclosure, not
 * tidiness: a symmetric link would put this client's whole plan in front of
 * anyone holding the other one's public share token.
 */
export function WikiLinkedClients({ slug, clientId }: { slug: string; clientId: string }) {
  const links = useWikiLinks(slug);
  const clients = useClientList({ status: "ACTIVE" });
  const add = useAddWikiLink(slug);
  const remove = useRemoveWikiLink(slug);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = links.data ?? [];
  const taken = new Set(rows.map((r) => r.linkedClientId));
  // Never offer this client itself: linking a wiki to its own client would double
  // every block, task and milestone on its own timeline, and the numbers would
  // look merely wrong rather than obviously broken. The server refuses it too.
  const options = (clients.data?.clients ?? []).filter(
    (c) => c.id !== clientId && !taken.has(c.id),
  );

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">05</span>
          {" // LINKED CLIENTS"}
        </span>
      </div>
      <div className="space-y-4 p-6">
        <p className="text-[13px] leading-6 text-[var(--text-3)]">
          Show another client&rsquo;s delivery work on this wiki&rsquo;s timeline — for a big
          workstream that has its own client record. Their blocks, tasks and milestones appear
          alongside this client&rsquo;s, each labelled with where it came from.
        </p>

        {links.isLoading ? (
          <div className="h-10 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : rows.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-4 text-center text-[13px] text-[var(--text-3)]">
            No linked clients. This wiki shows only its own work.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-1)] border-y border-[var(--border-1)]">
            {rows.map((r) => (
              <li key={r.id} className="group flex items-center gap-3 py-2.5">
                <LinkIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-1)]" title={r.clientName}>
                  {r.label?.trim() || r.clientName}
                </span>
                <button
                  type="button"
                  aria-label={`Unlink ${r.clientName}`}
                  onClick={() => {
                    setError(null);
                    void remove.mutateAsync(r.id).catch(() => setError("Couldn't unlink that."));
                  }}
                  className="shrink-0 text-[var(--text-4)] opacity-0 transition hover:text-[var(--danger-500)] focus:opacity-100 group-hover:opacity-100"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="app-select w-auto min-w-[200px]"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="">Link a client…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!choice || add.isPending}
            onClick={() => {
              setError(null);
              void add
                .mutateAsync({ linkedClientId: choice })
                .then(() => setChoice(""))
                .catch(() => setError("Couldn't link that client."));
            }}
            className="rounded-[6px] bg-[var(--brand-700)] px-3 py-2 text-xs font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-40"
          >
            Link
          </button>
        </div>

        <p className="text-[11px] leading-5 text-[var(--text-4)]">
          One way. Linking a client here does not show this client&rsquo;s work on theirs — a
          symmetric link would put this plan in front of anyone holding their share token.
        </p>
        {error ? <p className="text-xs text-[var(--danger-500)]">{error}</p> : null}
      </div>
    </section>
  );
}
