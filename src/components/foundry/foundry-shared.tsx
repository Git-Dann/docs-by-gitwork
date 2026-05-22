import { cn, formatDate } from "@/lib/format";
import type { HealthStatus } from "@/types/foundry";

const healthTone: Record<HealthStatus, string> = {
  on_track: "border-emerald-200 bg-emerald-50 text-emerald-800",
  watch: "border-amber-200 bg-amber-50 text-amber-800",
  at_risk: "border-rose-200 bg-rose-50 text-rose-800",
};

export function SectionHeading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
}) {
  return (
    <div>
      <p className="app-eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
        {title}
      </h2>
      {copy ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-3)]">{copy}</p> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="app-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-1)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--text-3)]">{detail}</p>
    </article>
  );
}

export function HealthBadge({ health }: { health: HealthStatus }) {
  const label =
    health === "on_track" ? "On track" : health === "watch" ? "Needs attention" : "At risk";

  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", healthTone[health])}>
      {label}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex rounded-full border border-[var(--border-2)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
      {score}/100 confidence
    </span>
  );
}

export function DatePill({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
      {formatDate(value)}
    </span>
  );
}
