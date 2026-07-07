import type { DocumentStatus } from "@/types/proposal";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function statusLabel(status: DocumentStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "PRODUCT_SIGN_OFF":
      return "Product Sign Off";
    case "TECH_SIGN_OFF":
      return "Tech Sign Off";
    case "IN_REVIEW":
      return "Product + Tech Sign Off";
    case "APPROVED":
      return "Approved";
    case "SENT":
      return "Sent";
    case "ACCEPTED":
      return "Accepted";
    case "DECLINED":
      return "Declined";
    case "ARCHIVED":
      return "Archived";
  }
}

export function statusTone(status: DocumentStatus): string {
  switch (status) {
    case "DRAFT":
      return "bg-[var(--surface-2)] text-[var(--text-2)]";
    case "PRODUCT_SIGN_OFF":
      return "bg-sky-100 text-sky-800";
    case "TECH_SIGN_OFF":
      return "bg-violet-100 text-violet-800";
    case "IN_REVIEW":
      return "bg-amber-100 text-amber-800";
    case "APPROVED":
      return "bg-emerald-100 text-emerald-800";
    case "SENT":
      return "bg-sky-100 text-sky-800";
    case "ACCEPTED":
      return "bg-emerald-100 text-emerald-800";
    case "DECLINED":
      return "bg-rose-100 text-rose-700";
    case "ARCHIVED":
      return "bg-[var(--surface-2)] text-[var(--text-2)]";
    default:
      return "bg-[var(--surface-2)] text-[var(--text-2)]";
  }
}

export function parseNumber(value: string, fallback = 0): number {
  const parsed = Number(value.replace(/[\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Short, stable, human-quotable task identifier derived from its id — e.g. "#9JQ5WP". */
export function taskRef(id: string): string {
  return "#" + id.slice(-6).toUpperCase();
}

const relativeDayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "just now" / "5m ago" / "3h ago" / "2d ago", then an absolute date past a week. */
export function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (Math.abs(diffMin) < 1) return "just now";
  if (Math.abs(diffMin) < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 7) return `${diffDay}d ago`;
  return relativeDayFormatter.format(date);
}
