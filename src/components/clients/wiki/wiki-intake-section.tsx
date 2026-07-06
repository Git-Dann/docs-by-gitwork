"use client";

import { useState } from "react";
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { WikiIntakeItemRecord } from "@/lib/api";
import {
  useCreatePublicWikiIntakeItem,
  useCreateWikiIntakeItem,
  useDeleteWikiIntakeItem,
  usePromoteWikiIntakeItem,
  useUpdateWikiIntakeItem,
} from "@/hooks/use-wiki";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type ItemType = "BUG" | "FEEDBACK" | "TASK";
type Priority = "LOW" | "MEDIUM" | "HIGH";

const TYPE_LABEL: Record<ItemType, string> = {
  BUG: "Bug",
  FEEDBACK: "Feedback",
  TASK: "Request",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  TRIAGED: "Triaged",
  PROMOTED: "Task created",
  CLOSED: "Closed",
};

export function WikiIntakeSection({
  slug,
  token,
  items,
  mode,
}: {
  slug: string;
  token?: string;
  items: WikiIntakeItemRecord[];
  mode: "internal" | "public";
}) {
  const isInternal = mode === "internal";
  const createInternal = useCreateWikiIntakeItem(slug);
  const createPublic = useCreatePublicWikiIntakeItem(token ?? "");
  const updateItem = useUpdateWikiIntakeItem(slug);
  const deleteItem = useDeleteWikiIntakeItem(slug);
  const promoteItem = usePromoteWikiIntakeItem(slug);

  const [localItems, setLocalItems] = useState(items);
  const [type, setType] = useState<ItemType>("FEEDBACK");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visibleItems = isInternal ? items : localItems;
  const busy = createInternal.isPending || createPublic.isPending;

  async function submit() {
    setError(null);
    const payload = {
      type,
      priority,
      title: title.trim(),
      description: description.trim() || null,
      requestedBy: requestedBy.trim() || null,
    };
    if (!payload.title) {
      setError("Add a short title first.");
      return;
    }
    try {
      const created = isInternal
        ? await createInternal.mutateAsync(payload)
        : await createPublic.mutateAsync(payload);
      if (!isInternal) setLocalItems((prev) => [created, ...prev]);
      setTitle("");
      setDescription("");
      setRequestedBy("");
      setPriority("MEDIUM");
      setType("FEEDBACK");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit this item.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="widget-card overflow-hidden">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // CLIENT INTAKE"}
          </span>
        </div>
        <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-[var(--border-1)] p-6 md:border-b-0 md:border-r">
            <h2 className="text-xl font-semibold text-[var(--text-1)]">Add a bug, feedback, or request</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-4)]">
              This stays inside the client Wiki first. Clients can add items here, but only Gitwork
              admins can promote them into the Dev task board and assign developers.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(["BUG", "FEEDBACK", "TASK"] as ItemType[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`rounded-[10px] border px-3 py-2 text-left transition ${
                    type === value
                      ? "border-[var(--brand-600)] bg-[var(--brand-50)] text-[var(--brand-800)]"
                      : "border-[var(--border-1)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]"
                  }`}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">{TYPE_LABEL[value]}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short title"
                className="w-full rounded-[9px] border border-[var(--border-2)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-100)]"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened, what should change, or any helpful context…"
                rows={5}
                className="w-full rounded-[9px] border border-[var(--border-2)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-100)]"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="rounded-[9px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm"
                >
                  <option value="LOW">Low priority</option>
                  <option value="MEDIUM">Medium priority</option>
                  <option value="HIGH">High priority</option>
                </select>
                <input
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="Requested by (optional)"
                  className="rounded-[9px] border border-[var(--border-2)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-100)]"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
              >
                <PlusIcon className="h-4 w-4" />
                {busy ? "Adding…" : "Add to Wiki intake"}
              </button>
            </div>
          </div>
          <div className="bg-[var(--surface-1)] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]" style={{ fontFamily: MONO }}>
              Workflow
            </p>
            <ol className="mt-4 space-y-3 text-sm text-[var(--text-3)]">
              <li><strong className="text-[var(--text-1)]">1.</strong> Client adds the item to this Wiki page or pushes it via API.</li>
              <li><strong className="text-[var(--text-1)]">2.</strong> Gitwork reviews and clarifies it here.</li>
              <li><strong className="text-[var(--text-1)]">3.</strong> Admin/Super Admin promotes it into Dev tasks when it is ready.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">02</span>
            {" // INTAKE LIST"}
          </span>
        </div>
        <div className="divide-y divide-[var(--border-1)]">
          {visibleItems.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--text-4)]">No bugs, feedback, or requests yet.</p>
          ) : (
            visibleItems.map((item) => (
              <article key={item.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--brand-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]">{TYPE_LABEL[item.type as ItemType]}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)] ring-1 ring-[var(--border-1)]">{item.priority}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)] ring-1 ring-[var(--border-1)]">{STATUS_LABEL[item.status] ?? item.status}</span>
                    </div>
                    <h3 className="text-base font-semibold text-[var(--text-1)]">{item.title}</h3>
                    {item.description && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-3)]">{item.description}</p>}
                    <p className="mt-2 text-[12px] text-[var(--text-4)]">
                      {item.requestedBy ? `Requested by ${item.requestedBy} · ` : ""}{new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {isInternal && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {item.status !== "PROMOTED" ? (
                        <button
                          type="button"
                          disabled={promoteItem.isPending}
                          onClick={() => void promoteItem.mutateAsync({ id: item.id })}
                          className="inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--brand-700)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--brand-800)] disabled:opacity-60"
                        >
                          <CheckCircleIcon className="h-4 w-4" /> Create task
                        </button>
                      ) : item.taskId ? (
                        <a href={`/app/portal/${slug}/tasks`} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] hover:bg-[var(--surface-1)]">
                          View tasks <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void updateItem.mutateAsync({ id: item.id, data: { status: item.status === "CLOSED" ? "NEW" : "CLOSED" } })}
                        className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                      >
                        {item.status === "CLOSED" ? "Reopen" : "Close"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteItem.mutateAsync(item.id)}
                        className="inline-flex items-center rounded-[7px] border border-red-200 px-2 py-1.5 text-red-600 hover:bg-red-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
