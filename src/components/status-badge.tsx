import type { DocumentStatus } from "@/types/proposal";
import { cn, statusLabel } from "@/lib/format";

// Every badge sits on the surface tokens, so it reads in both themes; the dot
// carries the status. (The old badges were violet/sky/amber text on bg-white.
// globals.css does not remap violet for dark mode, so Draft — the commonest
// status — rendered dark purple on near-black.)
const NEUTRAL = "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)]";

const statusBadgeTones: Record<DocumentStatus, { wrapper: string; dot: string }> = {
  DRAFT: { wrapper: NEUTRAL, dot: "bg-[var(--text-4)]" },
  PRODUCT_SIGN_OFF: { wrapper: NEUTRAL, dot: "bg-[var(--brand-600)]" },
  TECH_SIGN_OFF: { wrapper: NEUTRAL, dot: "bg-[var(--brand-600)]" },
  IN_REVIEW: { wrapper: NEUTRAL, dot: "bg-[var(--warning-500)]" },
  APPROVED: { wrapper: NEUTRAL, dot: "bg-[var(--success-500)]" },
  SENT: { wrapper: NEUTRAL, dot: "bg-[var(--brand-600)]" },
  ACCEPTED: {
    wrapper: "border-[var(--border-2)] bg-[var(--success-50)] text-[var(--text-1)]",
    dot: "bg-[var(--success-500)]",
  },
  DECLINED: { wrapper: NEUTRAL, dot: "bg-[var(--danger-500)]" },
  ARCHIVED: { wrapper: "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-4)]", dot: "bg-[var(--text-4)]" },
};

export function StatusBadge({ status, className }: { status: DocumentStatus; className?: string }) {
  const tone = statusBadgeTones[status] ?? statusBadgeTones.DRAFT;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone.wrapper,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {statusLabel(status)}
    </span>
  );
}
