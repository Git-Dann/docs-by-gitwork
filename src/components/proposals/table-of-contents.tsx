import type { ProposalSection } from "@/types/proposal";

export function TableOfContents({
  sections,
  className,
}: {
  sections: ProposalSection[];
  className?: string;
}) {
  return (
    <nav className={className} aria-label="Table of contents">
      <p className="text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase">
        Table of Contents
      </p>
      <ol className="mt-3 space-y-1.5 text-sm">
        {sections
          .filter((section) => section.isVisible)
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((section, index) => (
            <li key={section.id ?? `${section.key}-${index}`}>
              <a
                href={`#section-${section.id ?? `${section.key}-${index}`}`}
                className="flex items-center justify-between rounded px-2 py-1 text-[var(--text-2)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
              >
                <span>
                  {index + 1}. {section.title}
                </span>
              </a>
            </li>
          ))}
      </ol>
    </nav>
  );
}
