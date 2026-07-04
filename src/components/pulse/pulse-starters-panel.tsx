"use client";

import Link from "next/link";
import { useStarterList } from "@/hooks/use-starters";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import type { StarterType } from "@/server/starters";

const TYPE_LABEL: Record<StarterType, string> = {
  PROMPT: "Prompt",
  SKILL: "Skill",
  PLUGIN: "Plugin",
  KIT: "Kit",
  COLLECTION: "Collection",
};

function typeTone(type: StarterType): string {
  switch (type) {
    case "SKILL":
      return "text-emerald-600";
    case "PLUGIN":
      return "text-violet-600";
    case "KIT":
      return "text-amber-600";
    case "PROMPT":
      return "text-[var(--brand-700)]";
    default:
      return "text-[var(--text-4)]";
  }
}

/**
 * Gitwork Starters — the Prompt→Production library, surfaced from within Pulse. Admin-only tool
 * (mirrors PulseStudiesPanel). Lists the library and lets a starters holder add a new building block.
 */
export function PulseStartersPanel() {
  const { canManageStarters } = usePermissions();
  // Admin-only tool — hide the whole panel from everyone else and skip the (admin-gated) fetch.
  const { data: starters, isLoading } = useStarterList(canManageStarters);

  if (!canManageStarters) return null;

  const list = starters ?? [];

  return (
    <div className="app-card flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-1)]">
            Starters <span className="font-normal text-[var(--text-4)]">· Prompt→Production library</span>
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-4)]">
            Reusable building blocks — prompts, skills, plugins and kits to leap a project forward. Browse or adopt one straight from a scan.
          </p>
        </div>
        <Link href="/app/starters" className="shrink-0">
          <Button variant="secondary" size="sm">Open library</Button>
        </Link>
      </div>

      {isLoading ? null : list.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-xs text-[var(--text-4)]">
          No starters yet — add one from the library to get started.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-2)]">
          {list.slice(0, 6).map((starter) => (
            <Link
              key={starter.id}
              href={`/app/starters/${starter.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 transition hover:opacity-80"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-1)]">{starter.name}</p>
                <p className="truncate text-xs text-[var(--text-4)]">{starter.summary}</p>
              </div>
              <span className={cn("font-mono text-[10px] font-semibold uppercase tracking-[0.08em]", typeTone(starter.type))}>
                {TYPE_LABEL[starter.type]}
              </span>
            </Link>
          ))}
          {list.length > 6 && (
            <Link
              href="/app/starters"
              className="block py-2.5 text-center text-xs font-medium text-[var(--brand-700)] hover:underline"
            >
              View all {list.length} starters →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
