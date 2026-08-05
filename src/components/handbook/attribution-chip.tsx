import { LightBulbIcon } from "@heroicons/react/24/outline";

/**
 * A small credit chip for attributing an idea to a member of the team. Reusable — drop it wherever a
 * feature or surface came from someone's suggestion. On brand (blue family), tasteful, not shouty.
 */
export function AttributionChip({ name, label = "Idea by" }: { name: string; label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-200)] bg-[var(--surface-brand-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand-700)]"
      title={`${label} ${name}`}
    >
      <LightBulbIcon className="h-3.5 w-3.5" />
      <span className="text-[var(--text-4)]">{label}</span>
      <span>{name}</span>
    </span>
  );
}
