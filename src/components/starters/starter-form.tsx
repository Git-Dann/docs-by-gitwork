"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateStarter, useUpdateStarter, type StarterInput } from "@/hooks/use-starters";
import { Button } from "@/components/ui/button";
import type { StarterRecord, StarterType, StarterStatus } from "@/server/starters";

const TYPES: StarterType[] = ["PROMPT", "SKILL", "PLUGIN", "KIT", "COLLECTION"];
const STATUSES: StarterStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

const inputClass =
  "w-full rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-400)]";
const labelClass = "block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]";

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function csvToArray(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function StarterForm({ starter, onSaved }: { starter?: StarterRecord; onSaved?: (id: string) => void }) {
  const router = useRouter();
  const create = useCreateStarter();
  const update = useUpdateStarter(starter?.id ?? "");
  const isEdit = Boolean(starter);

  const [name, setName] = useState(starter?.name ?? "");
  const [summary, setSummary] = useState(starter?.summary ?? "");
  const [type, setType] = useState<StarterType>(starter?.type ?? "KIT");
  const [status, setStatus] = useState<StarterStatus>(starter?.status ?? "PUBLISHED");
  const [tags, setTags] = useState((starter?.tags ?? []).join(", "));
  const [description, setDescription] = useState(starter?.description ?? "");
  const [promptText, setPromptText] = useState(starter?.content?.promptText ?? "");
  const [whatYouGet, setWhatYouGet] = useState((starter?.content?.whatYouGet ?? []).join("\n"));
  const [install, setInstall] = useState((starter?.content?.install ?? []).join("\n"));
  const [techStack, setTechStack] = useState((starter?.content?.techStack ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);

  const saving = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !summary.trim()) {
      setError("Name and summary are required.");
      return;
    }
    const content: StarterInput["content"] = {
      ...(starter?.content ?? {}),
      promptText: promptText.trim() || undefined,
      whatYouGet: linesToArray(whatYouGet),
      install: linesToArray(install),
      techStack: csvToArray(techStack),
    };
    const payload: StarterInput = {
      name: name.trim(),
      summary: summary.trim(),
      description: description.trim() || null,
      type,
      status,
      tags: csvToArray(tags),
      content,
    };
    try {
      const result = isEdit ? await update.mutateAsync(payload) : await create.mutateAsync(payload);
      if (onSaved) onSaved(result.id);
      else router.push(`/app/starters/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save starter.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5">
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">{isEdit ? "01" : "01"}</span>
            {isEdit ? " // EDIT STARTER" : " // NEW STARTER"}
          </span>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div>
            <label className={labelClass} htmlFor="starter-name">
              Name
            </label>
            <input
              id="starter-name"
              className={`${inputClass} mt-1.5`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Gitwork Launch Kit"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="starter-summary">
              Summary
            </label>
            <input
              id="starter-summary"
              className={`${inputClass} mt-1.5`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One-line description shown on the card"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="starter-type">
                Type
              </label>
              <select
                id="starter-type"
                className={`${inputClass} mt-1.5`}
                value={type}
                onChange={(e) => setType(e.target.value as StarterType)}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="starter-status">
                Status
              </label>
              <select
                id="starter-status"
                className={`${inputClass} mt-1.5`}
                value={status}
                onChange={(e) => setStatus(e.target.value as StarterStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="starter-tags">
              Tags (comma-separated)
            </label>
            <input
              id="starter-tags"
              className={`${inputClass} mt-1.5`}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="design-system, ui, audit"
            />
          </div>
        </div>
      </section>

      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">02</span>
            {" // DETAIL"}
          </span>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div>
            <label className={labelClass} htmlFor="starter-prompt">
              Prompt text
            </label>
            <textarea
              id="starter-prompt"
              className={`${inputClass} mt-1.5 min-h-[240px] resize-y font-mono text-[13px]`}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="The full prompt this starter hands to an agent. Paste and edit it here — every save is versioned."
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="starter-description">
              Description (markdown)
            </label>
            <textarea
              id="starter-description"
              className={`${inputClass} mt-1.5 min-h-[120px] resize-y font-mono text-[13px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this starter is and when to reach for it."
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="starter-what">
              What you get (one per line)
            </label>
            <textarea
              id="starter-what"
              className={`${inputClass} mt-1.5 min-h-[100px] resize-y`}
              value={whatYouGet}
              onChange={(e) => setWhatYouGet(e.target.value)}
              placeholder={"Battle-tested CLAUDE.md rules\nSlash commands + hooks\nProject templates"}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="starter-install">
              Install / usage steps (one per line)
            </label>
            <textarea
              id="starter-install"
              className={`${inputClass} mt-1.5 min-h-[80px] resize-y`}
              value={install}
              onChange={(e) => setInstall(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="starter-tech">
              Tech stack (comma-separated)
            </label>
            <input
              id="starter-tech"
              className={`${inputClass} mt-1.5`}
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
              placeholder="Astro, Sanity, Cloudflare"
            />
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => router.push("/app/starters")}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="md" loading={saving}>
          {isEdit ? "Save changes" : "Create starter"}
        </Button>
      </div>
    </form>
  );
}
