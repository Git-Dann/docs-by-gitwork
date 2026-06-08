"use client";

import { useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { ChangelogEntryRecord } from "@/lib/api";

const PLATFORM_LABELS: Record<string, string> = {
  IOS: "iOS",
  ANDROID: "Android",
  FIRESTICK: "Fire TV",
  WEB: "Web",
  ALL: "All",
};

const PLATFORM_COLORS: Record<string, { bg: string; text: string }> = {
  IOS: { bg: "#f5f5f7", text: "#1a1a1a" },
  ANDROID: { bg: "#f0fdf4", text: "#166534" },
  FIRESTICK: { bg: "#fff7ed", text: "#c45500" },
  WEB: { bg: "#eff6ff", text: "#1D4ED8" },
  ALL: { bg: "#f8fafc", text: "#475569" },
};

type FilterPlatform = "ALL" | "IOS" | "ANDROID" | "FIRESTICK" | "WEB";

interface Props {
  entries: ChangelogEntryRecord[];
  onAdd: () => void;
  onDelete: (id: string) => Promise<void>;
  deletingId: string | null;
  readOnly?: boolean;
}

export function ChangelogSection({ entries, onAdd, onDelete, deletingId, readOnly = false }: Props) {
  const [filter, setFilter] = useState<FilterPlatform>("ALL");

  const filtered =
    filter === "ALL" ? entries : entries.filter((e) => e.platform === filter);

  const platforms: FilterPlatform[] = ["ALL", "IOS", "ANDROID", "FIRESTICK", "WEB"];

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-1)]">Changelog</h2>
          <p className="text-sm text-[var(--text-4)]">Version history across platforms</p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-800)] transition"
          >
            <PlusIcon className="h-4 w-4" />
            Add version
          </button>
        )}
      </div>

      {/* Platform filter tabs */}
      <div className="mb-5 flex flex-wrap gap-1">
        {platforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilter(p)}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium transition",
              filter === p
                ? "bg-[var(--brand-700)] text-white"
                : "border border-[rgba(0,0,0,0.1)] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
            ].join(" ")}
          >
            {PLATFORM_LABELS[p] ?? p}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-[rgba(0,0,0,0.12)] py-12 text-center">
          <p className="text-sm text-[var(--text-4)]">No entries yet for this platform.</p>
          {!readOnly && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-3 text-sm text-[var(--brand-700)] hover:underline"
            >
              + Add the first version
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[15px] top-0 h-full w-px bg-[rgba(0,0,0,0.08)]" />

          <div className="space-y-5">
            {filtered.map((entry) => {
              const pColor = PLATFORM_COLORS[entry.platform] ?? { bg: "#f8fafc", text: "#475569" };
              const dateStr = entry.releasedAt
                ? new Date(entry.releasedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

              return (
                <div key={entry.id} className="group relative flex gap-4 pl-10">
                  {/* Dot */}
                  <div className="absolute left-[11px] top-3 h-2 w-2 rounded-full bg-[var(--brand-700)] ring-2 ring-white" />

                  <div className="flex-1 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Platform badge */}
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                          style={{ background: pColor.bg, color: pColor.text, fontFamily: "var(--font-mono)" }}
                        >
                          {PLATFORM_LABELS[entry.platform]}
                        </span>
                        {/* Version badge */}
                        <span
                          className="rounded-[4px] bg-[var(--brand-700)] px-2 py-0.5 text-[11px] font-semibold text-white"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          v{entry.version}
                        </span>
                        <span className="text-sm font-semibold text-[var(--text-1)]">
                          {entry.title}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-[var(--text-4)]">{dateStr}</span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => void onDelete(entry.id)}
                            disabled={deletingId === entry.id}
                            className="rounded p-1 text-[var(--text-4)] opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition"
                            title="Delete entry"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {entry.body && (
                      <p className="mt-2 text-sm leading-6 text-[var(--text-2)] whitespace-pre-wrap">
                        {entry.body}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
