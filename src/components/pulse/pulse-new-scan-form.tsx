"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCreatePulseScan } from "@/hooks/use-pulse";
import type { PulseScanInputType } from "@/types/pulse";

const INPUT_TYPES: Array<{ value: PulseScanInputType; label: string; placeholder: string; description: string }> = [
  {
    value: "URL",
    label: "Live URL",
    placeholder: "https://myapp.com",
    description: "Deployed web app or SaaS product URL",
  },
  {
    value: "GITHUB_REPO",
    label: "GitHub Repo",
    placeholder: "owner/repo or https://github.com/owner/repo",
    description: "GitHub repository to analyse",
  },
  {
    value: "FREE_TEXT",
    label: "Description",
    placeholder: "Describe the project — what it does, the tech stack, current state…",
    description: "Free-text description when no URL or repo is available",
  },
];

export function PulseNewScanForm({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { mutateAsync, isPending } = useCreatePulseScan();

  const [projectName, setProjectName] = useState("");
  const [inputType, setInputType] = useState<PulseScanInputType>("URL");
  const [inputValue, setInputValue] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedType = INPUT_TYPES.find((t) => t.value === inputType)!;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!projectName.trim()) {
      setError("Project name is required.");
      return;
    }
    if (!inputValue.trim()) {
      setError(`${selectedType.label} is required.`);
      return;
    }

    try {
      const result = await mutateAsync({
        projectName: projectName.trim(),
        inputType,
        inputUrl: inputType === "URL" ? inputValue.trim() : undefined,
        inputGithubRepo: inputType === "GITHUB_REPO" ? inputValue.trim() : undefined,
        inputDescription: inputType === "FREE_TEXT" ? inputValue.trim() : undefined,
        clientId: clientId || undefined,
      });
      router.push(`/app/pulse/${result.scan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5">
        <label className="app-field-label">Project name</label>
        <input
          className="app-input"
          placeholder="e.g. Acme CRM Dashboard"
          value={projectName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setProjectName(e.target.value)}
          disabled={isPending}
        />
      </div>

      {clients.length > 0 && (
        <div className="space-y-1.5">
          <label className="app-field-label">Client (optional)</label>
          <select
            className="app-input"
            value={clientId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setClientId(e.target.value)}
            disabled={isPending}
          >
            <option value="">No client selected</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-3">
        <label className="app-field-label">Input type</label>
        <div className="flex gap-2">
          {INPUT_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => {
                setInputType(type.value);
                setInputValue("");
              }}
              disabled={isPending}
              className={
                inputType === type.value
                  ? "flex-1 rounded-[10px] border border-[var(--brand-500)] bg-[var(--brand-50)] px-3 py-2.5 text-sm font-medium text-[var(--brand-700)]"
                  : "flex-1 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2.5 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)]"
              }
            >
              {type.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-4)]">{selectedType.description}</p>
      </div>

      <div className="space-y-1.5">
        <label className="app-field-label">{selectedType.label}</label>
        {inputType === "FREE_TEXT" ? (
          <textarea
            className="app-input min-h-[120px] resize-y"
            placeholder={selectedType.placeholder}
            value={inputValue}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
            disabled={isPending}
          />
        ) : (
          <input
            className="app-input"
            placeholder={selectedType.placeholder}
            value={inputValue}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
            disabled={isPending}
          />
        )}
      </div>

      {error && (
        <p className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="md" loading={isPending}>
          {isPending ? "Starting scan…" : "Run Pulse scan"}
        </Button>
      </div>
    </form>
  );
}
