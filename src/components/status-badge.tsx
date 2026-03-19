import type { DocumentStatus } from "@/types/proposal";
import { cn, statusLabel } from "@/lib/format";

const statusBadgeTones: Record<DocumentStatus, { wrapper: string; dot: string }> = {
  DRAFT: {
    wrapper: "border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-400",
  },
  PRODUCT_SIGN_OFF: {
    wrapper: "border-sky-200 bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
  },
  TECH_SIGN_OFF: {
    wrapper: "border-violet-200 bg-violet-50 text-violet-800",
    dot: "bg-violet-500",
  },
  IN_REVIEW: {
    wrapper: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  APPROVED: {
    wrapper: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  SENT: {
    wrapper: "border-sky-200 bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
  },
  ARCHIVED: {
    wrapper: "border-zinc-200 bg-zinc-100 text-zinc-700",
    dot: "bg-zinc-400",
  },
};

export function StatusBadge({ status, className }: { status: DocumentStatus; className?: string }) {
  const tone = statusBadgeTones[status] ?? statusBadgeTones.DRAFT;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone.wrapper,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {statusLabel(status)}
    </span>
  );
}
