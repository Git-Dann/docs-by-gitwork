"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTemplates } from "@/lib/api";
import { useLocalSettings } from "@/lib/local-settings";

export function TemplateManagement() {
  const { settings, updateSettings } = useLocalSettings();
  const { data, isPending, error } = useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        <h2 className="text-base font-semibold">Template-owned branding</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Reusable cover branding lives here so proposals only carry client-specific content.
        </p>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <Input
            label="Cover brand logo URL"
            value={settings.templateBranding.coverBrandLogoUrl}
            onChange={(coverBrandLogoUrl) =>
              updateSettings((current) => ({
                ...current,
                templateBranding: { ...current.templateBranding, coverBrandLogoUrl },
              }))
            }
          />
          <Input
            label="Cover top accent URL"
            value={settings.templateBranding.coverTopAccentUrl}
            onChange={(coverTopAccentUrl) =>
              updateSettings((current) => ({
                ...current,
                templateBranding: { ...current.templateBranding, coverTopAccentUrl },
              }))
            }
          />
          <Input
            label="Cover bottom accent URL"
            value={settings.templateBranding.coverBottomAccentUrl}
            onChange={(coverBottomAccentUrl) =>
              updateSettings((current) => ({
                ...current,
                templateBranding: { ...current.templateBranding, coverBottomAccentUrl },
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-1)] bg-white p-4">
        {isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading templates...</p>
        ) : error ? (
          <p className="text-sm text-rose-700">{(error as Error).message}</p>
        ) : (
          <div className="space-y-3">
            {data?.templates.map((template) => (
              <article key={template.id} className="rounded-md border border-[var(--border-1)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{template.name}</h3>
                  {template.isDefault ? (
                    <span className="rounded-full bg-[var(--surface-brand)] px-2 py-0.5 text-xs font-medium text-[var(--brand-700)]">
                      Default
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[var(--text-3)]">{template.description}</p>
                <p className="mt-2 text-xs text-[var(--text-2)]">
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

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-[var(--border-1)] px-3 text-sm"
      />
    </label>
  );
}
