import type { DocumentStatus } from "@/types/proposal";
import { cn, statusLabel } from "@/lib/format";

const statusBadgeTones: Record<DocumentStatus, { wrapper: string; dot: string }> = {
  DRAFT: {
    wrapper: "border-violet-200 bg-white text-violet-700",
    dot: "bg-violet-500",
  },
  PRODUCT_SIGN_OFF: {
    wrapper: "border-sky-200 bg-white text-sky-800",
    dot: "bg-sky-500",
  },
  TECH_SIGN_OFF: {
    wrapper: "border-emerald-200 bg-white text-emerald-800",
    dot: "bg-emerald-500",
  },
  IN_REVIEW: {
    wrapper: "border-amber-200 bg-white text-amber-800",
    dot: "bg-amber-500",
  },
  APPROVED: {
    wrapper: "border-emerald-200 bg-white text-emerald-800",
    dot: "bg-emerald-500",
  },
  SENT: {
    wrapper: "border-sky-200 bg-white text-sky-800",
    dot: "bg-sky-500",
  },
  ACCEPTED: {
    wrapper: "border-emerald-300 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  DECLINED: {
    wrapper: "border-rose-200 bg-white text-rose-700",
    dot: "bg-rose-500",
  },
  ARCHIVED: {
    wrapper: "border-[var(--border-2)] bg-white text-[var(--text-2)]",
    dot: "bg-[var(--text-4)]",
  },
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
