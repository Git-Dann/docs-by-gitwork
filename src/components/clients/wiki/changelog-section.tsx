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

const SEMVER_STYLES = {
  MAJOR: "bg-red-50 text-red-700 border border-red-200",
  MINOR: "bg-amber-50 text-amber-700 border border-amber-200",
  PATCH: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

function getSemverType(v: string): "MAJOR" | "MINOR" | "PATCH" | null {
  const match = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);
  if (patch === 0 && minor === 0) return "MAJOR";
  if (patch === 0) return "MINOR";
  return "PATCH";
}

type BodyPart =
  | { type: "text"; text: string }
  | { type: "list"; items: string[] };

function parseBodyParts(text: string): BodyPart[] {
  const lines = text.split("\n");
  const parts: BodyPart[] = [];
  let currentList: string[] | null = null;

  for (const line of lines) {
    if (/^[-•*]\s/.test(line.trim())) {
      if (!currentList) {
        currentList = [];
        parts.push({ type: "list", items: currentList });
      }
      currentList.push(line.replace(/^[-•*]\s/, "").trim());
    } else {
      currentList = null;
      if (line.trim()) {
        parts.push({ type: "text", text: line });
      }
    }
  }
  return parts;
}

function RenderBody({ text }: { text: string }) {
  const parts = parseBodyParts(text);
  return (
    <div className="mt-2 space-y-1">
      {parts.map((part, i) =>
        part.type === "list" ? (
          <ul key={i} className="ml-4 list-disc space-y-0.5 text-[13px] leading-6 text-[var(--text-2)]">
            {part.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="text-[13px] leading-6 text-[var(--text-2)]">
            {part.text}
          </p>
        ),
      )}
    </div>
  );
}

type FilterPlatform = "ALL" | "IOS" | "ANDROID" | "FIRESTICK" | "WEB";

interface Props {
  entries: ChangelogEntryRecord[];
  /** Optional: shown only in the empty-state inline prompt. Parent action bar handles the primary trigger. */
  onAdd?: () => void;
  onDelete: (id: string) => Promise<void>;
  deletingId: string | null;
  readOnly?: boolean;
}

export function ChangelogSection({
  entries,
  onAdd,
  onDelete,
  deletingId,
  readOnly = false,
}: Props) {
  const [filter, setFilter] = useState<FilterPlatform>("ALL");

  const filtered =
    filter === "ALL" ? entries : entries.filter((e) => e.platform === filter);

  const platforms: FilterPlatform[] = ["ALL", "IOS", "ANDROID", "FIRESTICK", "WEB"];

  return (
    <div>
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
                ? "bg-[var(--text-1)] text-white"
                : "border border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
            ].join(" ")}
          >
            {PLATFORM_LABELS[p] ?? p}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] py-14 text-center">
          <p className="text-[13px] text-[var(--text-4)]">No entries yet for this platform.</p>
          {!readOnly && onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-700)] hover:underline"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add the first version
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[15px] top-0 h-full w-px bg-[rgba(0,0,0,0.07)]" />

          <div className="space-y-4">
            {filtered.map((entry) => {
              const pColor =
                PLATFORM_COLORS[entry.platform] ?? { bg: "#f8fafc", text: "#475569" };
              const semver = getSemverType(entry.version);
              const dateStr = entry.releasedAt
                ? new Date(entry.releasedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : new Date(entry.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });

              return (
                <div key={entry.id} className="group relative flex gap-4 pl-10">
                  {/* Timeline dot */}
                  <div className="absolute left-[11px] top-[14px] h-[9px] w-[9px] rounded-full border-2 border-white bg-[var(--text-3)] ring-1 ring-[rgba(0,0,0,0.12)]" />

                  <div className="flex-1 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Platform badge */}
                        <span
                          className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                          style={{
                            background: pColor.bg,
                            color: pColor.text,
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {PLATFORM_LABELS[entry.platform]}
                        </span>
                        {/* Version badge */}
                        <span
                          className="rounded-[4px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-2)]"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          v{entry.version}
                        </span>
                        {/* Semver type badge */}
                        {semver && (
                          <span
                            className={`rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${SEMVER_STYLES[semver]}`}
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {semver}
                          </span>
                        )}
                        <span className="text-[13px] font-semibold text-[var(--text-1)]">
                          {entry.title}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[11px] text-[var(--text-4)]">{dateStr}</span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => void onDelete(entry.id)}
                            disabled={deletingId === entry.id}
                            className="rounded p-1 text-[var(--text-4)] opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                            title="Delete entry"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {entry.body && <RenderBody text={entry.body} />}
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
