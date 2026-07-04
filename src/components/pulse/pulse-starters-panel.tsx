"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
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
 * `03 // STARTERS` — the Prompt→Production library, third of the three-card top row. Admin-only
 * tool (mirrors PulseStudiesPanel). DESIGN.md widget grammar: mono numbered header + count chip,
 * blurb, capped list, bottom CTA.
 */
export function PulseStartersPanel() {
  const { canManageStarters } = usePermissions();
  // Admin-only tool — hide the whole panel from everyone else and skip the (admin-gated) fetch.
  const { data: starters, isLoading } = useStarterList(canManageStarters);

  if (!canManageStarters) return null;

  const list = starters ?? [];

  return (
    <article className="widget-card h-full">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">03</span>{" // STARTERS"}
        </span>
        {list.length > 0 && (
          <span className="widget-header__status">{list.length} in library</span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[12px] leading-snug text-[var(--text-4)]">
          Reusable building blocks — prompts, skills, plugins and kits. Browse or adopt one straight from a scan.
        </p>

        <div className="mt-3 flex-1">
          {isLoading ? null : list.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[var(--border-2)] px-4 py-4 text-center text-xs text-[var(--text-4)]">
              No starters yet — add one from the library.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-2)]">
              {list.slice(0, 3).map((starter) => (
                <Link
                  key={starter.id}
                  href={`/app/starters/${starter.id}`}
                  className="group flex items-center gap-x-3 py-2 transition hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--text-1)]">{starter.name}</p>
                    <p className="widget-data-label mt-0.5 truncate normal-case tracking-normal">{starter.summary}</p>
                  </div>
                  <span className={cn("widget-data-label shrink-0", typeTone(starter.type))}>
                    {TYPE_LABEL[starter.type]}
                  </span>
                  <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)] opacity-0 transition group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <Link href="/app/starters" className="mt-3 block">
          <Button variant="secondary" size="sm" className="w-full">Open library</Button>
        </Link>
      </div>
    </article>
  );
}
