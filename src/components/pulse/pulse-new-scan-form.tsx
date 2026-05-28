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
  configuredProviders: Array<{ id: AiProviderId; label: string; model: string }>;
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
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([""]);
  const [showCompetitors, setShowCompetitors] = useState(false);
  const [projectDescription, setProjectDescription] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testPassword, setTestPassword] = useState("");
  const [showTestLogin, setShowTestLogin] = useState(false);
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
      let resolvedUrl = inputType === "URL" ? inputValue.trim() : undefined;
      if (resolvedUrl && !/^https?:\/\//i.test(resolvedUrl)) {
        resolvedUrl = `https://${resolvedUrl}`;
      }

      const cleanedCompetitors = competitorUrls
        .map((u) => u.trim())
        .filter(Boolean)
        .map((u) => (!/^https?:\/\//i.test(u) ? `https://${u}` : u));

      const result = await mutateAsync({
        projectName: projectName.trim(),
        inputType,
        inputUrl: resolvedUrl,
        inputGithubRepo: inputType === "GITHUB_REPO" ? inputValue.trim() : undefined,
        inputDescription: inputType === "FREE_TEXT" ? inputValue.trim() : undefined,
        platform,
        clientId: clientId || undefined,
        aiProvider: selectedProvider,
        competitorUrls: cleanedCompetitors.length > 0 ? cleanedCompetitors : undefined,
        projectDescription: projectDescription.trim() || undefined,
        testEmail: showTestLogin && testEmail.trim() ? testEmail.trim() : undefined,
        testPassword: showTestLogin && testPassword.trim() ? testPassword.trim() : undefined,
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

      {inputType !== "FREE_TEXT" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="app-field-label">What does this product do?</label>
            <span className={`text-xs ${projectDescription.length > 450 ? "text-amber-600" : "text-[var(--text-4)]"}`}>
              {projectDescription.length}/500
            </span>
          </div>
          <textarea
            className="app-input resize-none"
            rows={2}
            maxLength={500}
            placeholder="e.g. B2B footfall analytics platform for retail. Helps store managers track visitor patterns and optimise floor layouts."
            value={projectDescription}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setProjectDescription(e.target.value)}
            disabled={isPending}
          />
          <p className="text-xs text-[var(--text-4)]">
            Optional — helps the AI classify your product correctly, especially if the app is behind a login.
          </p>
        </div>
      )}

      {inputType === "URL" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="app-field-label">Benchmark against competitors</label>
            <button
              type="button"
              onClick={() => setShowCompetitors((v) => !v)}
              disabled={isPending}
              className="text-xs text-[var(--brand-600)] hover:underline"
            >
              {showCompetitors ? "Hide" : "+ Add competitors"}
            </button>
          </div>
          {showCompetitors && (
            <div className="space-y-2">
              {competitorUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="app-input flex-1"
                    placeholder={`Competitor ${i + 1} URL`}
                    value={url}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const next = [...competitorUrls];
                      next[i] = e.target.value;
                      setCompetitorUrls(next);
                    }}
                    disabled={isPending}
                  />
                  {competitorUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCompetitorUrls(competitorUrls.filter((_, j) => j !== i))}
                      disabled={isPending}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {competitorUrls.length < 3 && (
                <button
                  type="button"
                  onClick={() => setCompetitorUrls([...competitorUrls, ""])}
                  disabled={isPending}
                  className="text-xs text-[var(--brand-600)] hover:underline"
                >
                  + Add another (max 3)
                </button>
              )}
              <p className="text-xs text-[var(--text-4)]">
                We&apos;ll run a parallel scan on each competitor and AI will generate a side-by-side comparison.
              </p>
            </div>
          )}
        </div>
      )}

      {inputType === "URL" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="app-field-label">Test account login</label>
            <button
              type="button"
              onClick={() => setShowTestLogin((v) => !v)}
              disabled={isPending}
              className="text-xs text-[var(--brand-600)] hover:underline"
            >
              {showTestLogin ? "Hide" : "+ Add login"}
            </button>
          </div>
          {showTestLogin && (
            <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
              <p className="text-xs text-[var(--text-3)]">
                Pulse will log into the app and scan the authenticated experience. Use a test or demo account — credentials are used once and never stored.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="app-field-label text-xs">Email</label>
                  <input
                    type="email"
                    className="app-input"
                    placeholder="test@example.com"
                    value={testEmail}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setTestEmail(e.target.value)}
                    disabled={isPending}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="app-field-label text-xs">Password</label>
                  <input
                    type="password"
                    className="app-input"
                    placeholder="••••••••"
                    value={testPassword}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setTestPassword(e.target.value)}
                    disabled={isPending}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-[8px] bg-amber-50 border border-amber-200 px-3 py-2">
                <span className="text-xs text-amber-700">Use a test account only. Never use your main account credentials. Credentials are discarded after the scan runs.</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="app-field-label">AI provider &amp; model</label>
        <select
          className="app-select"
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value as AiProviderId)}
          disabled={isPending || configuredProviders.length === 0}
        >
          {configuredProviders.length === 0 ? (
            <option value="">No provider configured — add one in Settings → Integrations</option>
          ) : (
            configuredProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {p.model}
              </option>
            ))
          )}
        </select>
        <p className="text-xs text-[var(--text-4)]">
          {(() => {
            const active = configuredProviders.find((p) => p.id === selectedProvider);
            if (!active) return "Configure an AI provider in Settings → Integrations first.";
            const isDefault = selectedProvider === activeProvider;
            return isDefault
              ? `This is your default provider. Change in Settings → Integrations to save a new default.`
              : `Using ${active.label} (${active.model}) for this scan only. Your default is still ${configuredProviders.find((p) => p.id === activeProvider)?.label ?? activeProvider}.`;
          })()}
        </p>
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
