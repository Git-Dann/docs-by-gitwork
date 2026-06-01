// Display helpers for Backstage UI. Pure functions, no React, easy to test.

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

export function formatDay(iso: string): string {
  return dayFormatter.format(new Date(iso));
}

export function formatDateRange(
  startIso: string,
  endIso: string,
  opts: { halfDayStart?: boolean; halfDayEnd?: boolean } = {},
): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate();

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = sameYear ? monthFormatter.format(start) : dayFormatter.format(start);
  const endLabel = dayFormatter.format(end);

  if (sameDay) {
    const tail = opts.halfDayStart || opts.halfDayEnd ? " (½ day)" : "";
    return `${endLabel}${tail}`;
  }

  let label = `${startLabel} → ${endLabel}`;
  if (opts.halfDayStart) label += " (½ start)";
  if (opts.halfDayEnd) label += " (½ end)";
  return label;
}

export function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 1) return "just now";
  if (Math.abs(diffMin) < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 7) return `${diffDay}d ago`;
  return dayFormatter.format(date);
}

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();
function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  let f = CURRENCY_FORMATTERS.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-GB", { style: "currency", currency });
    } catch {
      f = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
    }
    CURRENCY_FORMATTERS.set(currency, f);
  }
  return f;
}

export function formatMoney(amount: number, currency: string): string {
  return getCurrencyFormatter(currency).format(amount);
}
