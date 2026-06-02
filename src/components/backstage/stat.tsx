// Editorial stat tile: DM Serif Display figure over a JetBrains Mono label —
// the platform's data signature (see DESIGN.md). Shared across Backstage panels.
export function Stat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number | string;
  suffix: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-brand)] p-4"
          : "rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4"
      }
    >
      <p
        className="text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className="text-[32px] leading-none text-[var(--text-1)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {value}
        </span>
        <span className="text-[11px] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
          {suffix}
        </span>
      </p>
    </div>
  );
}
