"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCreatePulseScan } from "@/hooks/use-pulse";
import type { PulseScanInputType } from "@/types/pulse";

const INPUT_TYPES: Array<{ value: PulseScanInputType; label: string; placeholder: string; description: string }> = [
  {
    value: "URL",
    label: "URL",
    placeholder: "https://myapp.com",
    description: "Web app, SaaS, marketing site, App Store listing, or Google Play listing — any live URL",
  },
  {
    value: "GITHUB_REPO",
    label: "GitHub Repo",
    placeholder: "owner/repo or https://github.com/owner/repo",
    description: "Any codebase — Next.js, React Native, Flutter, Python, mobile, or full-stack",
  },
  {
    value: "FREE_TEXT",
    label: "Description",
    placeholder: "Describe the project — what it does, platform (web / iOS / Android), tech stack, current state…",
    description: "Use this for APK / IPA builds, internal tools, or any project without a public URL",
  },
];

const PLATFORMS = [
  { value: "WEB_APP", label: "Web app" },
  { value: "SAAS", label: "SaaS" },
  { value: "MARKETING_SITE", label: "Marketing site" },
  { value: "IOS_APP", label: "iOS app" },
  { value: "ANDROID_APP", label: "Android app" },
  { value: "CROSS_PLATFORM_MOBILE", label: "React Native / Flutter" },
  { value: "DESKTOP_APP", label: "Desktop app" },
  { value: "CHROME_EXTENSION", label: "Chrome extension" },
  { value: "API_BACKEND", label: "API / backend" },
  { value: "CLI_TOOL", label: "CLI tool" },
  { value: "OTHER", label: "Other" },
];

type AiProviderId = "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";

export function PulseNewScanForm({
  clients,
  configuredProviders,
  activeProvider,
}: {
  clients: Array<{ id: string; name: string }>;
  configuredProviders: Array<{ id: AiProviderId; label: string }>;
  activeProvider: AiProviderId;
}) {
  const router = useRouter();
  const { mutateAsync, isPending } = useCreatePulseScan();

  const [projectName, setProjectName] = useState("");
  const [inputType, setInputType] = useState<PulseScanInputType>("URL");
  const [inputValue, setInputValue] = useState("");
  const [platform, setPlatform] = useState("WEB_APP");
  const [clientId, setClientId] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<AiProviderId>(activeProvider);
  const [error, setError] = useState<string | null>(null);

  const selectedType = INPUT_TYPES.find((t) => t.value === inputType)!;
  const showProviderPicker = configuredProviders.length > 1;

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
      let resolvedUrl = inputType === "URL" ? inputValue.trim() : undefined;
      if (resolvedUrl && !/^https?:\/\//i.test(resolvedUrl)) {
        resolvedUrl = `https://${resolvedUrl}`;
      }

      const result = await mutateAsync({
        projectName: projectName.trim(),
        inputType,
        inputUrl: resolvedUrl,
        inputGithubRepo: inputType === "GITHUB_REPO" ? inputValue.trim() : undefined,
        inputDescription: inputType === "FREE_TEXT" ? inputValue.trim() : undefined,
        platform,
        clientId: clientId || undefined,
        aiProvider: selectedProvider,
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
            className="app-select"
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
        <label className="app-field-label">Platform</label>
        <select
          className="app-select"
          value={platform}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setPlatform(e.target.value)}
          disabled={isPending}
        >
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
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

      {showProviderPicker && (
        <div className="space-y-2">
          <label className="app-field-label">AI provider for this scan</label>
          <div className="flex flex-wrap gap-2">
            {configuredProviders.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProvider(p.id)}
                disabled={isPending}
                className={
                  selectedProvider === p.id
                    ? "rounded-[10px] border border-[var(--brand-500)] bg-[var(--brand-50)] px-3 py-2 text-sm font-medium text-[var(--brand-700)]"
                    : "rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--text-4)]">
            Default is {configuredProviders.find((p) => p.id === activeProvider)?.label ?? activeProvider} — override per scan here.
          </p>
        </div>
      )}

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
