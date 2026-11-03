"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

/**
 * Page numbers to show for `page` (0-based) of `pages`: always the first and last, the
 * current one and its neighbours, and "…" where pages are skipped. Never more than seven
 * slots, so the control keeps one width however long the list grows.
 */
export function pageWindow(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = new Set([0, pages - 1, page - 1, page, page + 1]);
  if (page <= 2) [1, 2, 3].forEach((i) => keep.add(i));
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2].forEach((i) => keep.add(i));
  const sorted = [...keep].filter((i) => i >= 0 && i < pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((i, n) => {
    if (n > 0 && i - sorted[n - 1] > 1) out.push("…");
    out.push(i);
  });
  return out;
}

/** "1–20 of 45" on the left, ‹ 1 2 3 › on the right. Renders nothing for a single page. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  label = "Pages",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-[6px] px-2 text-[12px] tabular-nums transition disabled:opacity-30";
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 py-1">
      <span className="text-[12px] tabular-nums text-[var(--text-4)]">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          className={`${btn} text-[var(--text-3)] hover:bg-[var(--surface-1)]`}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        {pageWindow(page, pages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-[12px] text-[var(--text-4)]">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p + 1}`}
              aria-current={p === page ? "page" : undefined}
              onClick={() => onPage(p)}
              className={
                p === page
                  ? `${btn} border border-[var(--brand-600)] bg-[var(--brand-50)] font-semibold text-[var(--brand-700)]`
                  : `${btn} text-[var(--text-2)] hover:bg-[var(--surface-1)]`
              }
            >
              {p + 1}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          className={`${btn} text-[var(--text-3)] hover:bg-[var(--surface-1)]`}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
