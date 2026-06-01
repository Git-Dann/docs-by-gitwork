import { cn } from "@/lib/format";

const STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-zinc-100 text-zinc-600",
  SUBMITTED: "bg-sky-100 text-sky-800",
  REIMBURSED: "bg-emerald-100 text-emerald-800",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
        STYLES[status] ?? "bg-zinc-100 text-zinc-700",
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}
