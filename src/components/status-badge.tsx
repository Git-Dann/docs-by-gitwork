import type { DocumentStatus } from "@/types/proposal";
import { cn, statusLabel, statusTone } from "@/lib/format";

export function StatusBadge({ status, className }: { status: DocumentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        statusTone(status),
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
