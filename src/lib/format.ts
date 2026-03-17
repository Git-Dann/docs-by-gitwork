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
  return status
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk[0]?.toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function statusTone(status: DocumentStatus): string {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-700";
    case "IN_REVIEW":
      return "bg-amber-100 text-amber-800";
    case "APPROVED":
      return "bg-emerald-100 text-emerald-800";
    case "SENT":
      return "bg-sky-100 text-sky-800";
    case "ARCHIVED":
      return "bg-zinc-200 text-zinc-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function parseNumber(value: string, fallback = 0): number {
  const parsed = Number(value.replace(/[\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}
