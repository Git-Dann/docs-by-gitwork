import { ClockIcon } from "@heroicons/react/24/outline";

/**
 * The Handbook article's navy hero band. Shared by the reading surface (handbook-article.tsx) and
 * the editor's live preview (handbook-form.tsx) so what an author previews is exactly what ships.
 * Must be rendered inside a `.handbook-reader` container (it uses the scoped `--hb-*` palette).
 */
export function ArticleHero({
  title,
  summary,
  category,
  readMinutes,
  author,
  updatedLabel,
  tags,
}: {
  title: string;
  summary?: string | null;
  category: string;
  readMinutes?: number | null;
  author?: string | null;
  updatedLabel?: string | null;
  tags?: string[];
}) {
  return (
    <header className="relative overflow-hidden px-8 pb-9 pt-8 sm:px-12" style={{ background: "var(--hb-navy)" }}>
      <span
        aria-hidden
        className="hb-serif pointer-events-none absolute -right-3 -top-10 select-none text-[190px] leading-none"
        style={{ color: "#ffffff", opacity: 0.04 }}
      >
        §
      </span>
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="hb-mono text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#5b8def" }}>
            Gitwork Handbook
          </span>
          <span className="hb-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--hb-on-dark-muted)" }}>
            {category || "Uncategorised"} · Internal Standard
          </span>
        </div>

        <div className="mt-8">
          <div className="hb-mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#5b8def" }}>
            <span>{category || "Uncategorised"}</span>
            {readMinutes ? (
              <span className="inline-flex items-center gap-1" style={{ color: "var(--hb-on-dark-muted)" }}>
                <ClockIcon className="h-3 w-3" />
                {readMinutes} min read
              </span>
            ) : null}
          </div>
          <div className="mt-3 h-0.5 w-12 rounded-full" style={{ background: "#5b8def" }} />
          <h1 className="hb-serif mt-4 max-w-3xl text-[46px] leading-[1.04] tracking-[-0.02em]" style={{ color: "var(--hb-on-dark)" }}>
            {title || "Untitled article"}
            <span style={{ color: "#5b8def" }}>.</span>
          </h1>
          {summary ? (
            <p className="mt-4 max-w-2xl text-[18px] leading-8" style={{ color: "var(--hb-on-dark-muted)" }}>
              {summary}
            </p>
          ) : null}
          {(author || updatedLabel || (tags && tags.length > 0)) && (
            <div className="hb-mono mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--hb-on-dark-muted)" }}>
              {author ? <span>By {author}</span> : null}
              {updatedLabel ? <span>Updated {updatedLabel}</span> : null}
              {tags && tags.length > 0 ? <span>{tags.map((t) => `#${t}`).join("  ")}</span> : null}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
