"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchTemplates } from "@/lib/api";

export function TemplateManagement() {
  const { data, isPending, error } = useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  });

  return (
    <div className="space-y-5">
      <section className="app-card p-5">
        <p className="app-eyebrow">Templates</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
          Template library
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Proposal branding, confidentiality defaults, and reusable snippets are managed in Settings. Templates stay focused on document structure.
        </p>

        <div className="mt-5">
          <Link href="/app/settings">
            <Button type="button" variant="secondary" size="sm">
              Open settings
            </Button>
          </Link>
        </div>
      </section>

      <section className="app-card p-5">
        {isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading templates...</p>
        ) : error ? (
          <p className="text-sm text-rose-700">{(error as Error).message}</p>
        ) : (
          <div className="space-y-3">
            {data?.templates.map((template) => (
              <article
                key={template.id}
                className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-[var(--text-1)]">{template.name}</h3>
                  {template.isDefault ? (
                    <span className="app-chip border-transparent bg-[var(--surface-brand)] text-[var(--brand-700)]">
                      Default
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{template.description}</p>
                <p className="mt-3 text-sm text-[var(--text-2)]">
                  Document type: {template.documentType} · Sections: {template.sections.length}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
