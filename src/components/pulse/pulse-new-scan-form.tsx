"use client";

import { useState, useRef, useEffect, type FormEvent, type ChangeEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, GlobeAltIcon, CodeBracketIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useCreatePulseScan } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/format";
import { JURISDICTIONS, JURISDICTION_CODES, JURISDICTION_PRESETS } from "@/server/pulse-checks/jurisdictions";
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

/**
 * Grouped so eleven options read as five decisions rather than a flat list to scan.
 * The values are unchanged — this is labelling and ordering only, so existing scans
 * and any saved platform stay valid.
 *
 * "Cross-platform mobile" is spelled out because React Native and Flutter are two
 * different toolchains that happen to share one option: the checks a scan runs are
 * chosen from the REPO (pubspec.yaml → Flutter, JS manifest → React Native), not from
 * this dropdown, and today only Flutter has its own check family. The old
 * "React Native / Flutter" label implied a parity that does not exist.
 */
const PLATFORM_GROUPS: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [
  {
    label: "Web",
    options: [
      { value: "WEB_APP", label: "Web app" },
      { value: "SAAS", label: "SaaS" },
      { value: "MARKETING_SITE", label: "Marketing site" },
    ],
  },
  {
    label: "Mobile",
    options: [
      { value: "IOS_APP", label: "iOS app" },
      { value: "ANDROID_APP", label: "Android app" },
      { value: "CROSS_PLATFORM_MOBILE", label: "Cross-platform mobile (React Native / Flutter)" },
    ],
  },
  {
    label: "Other surfaces",
    options: [
      { value: "DESKTOP_APP", label: "Desktop app" },
      { value: "CHROME_EXTENSION", label: "Chrome extension" },
    ],
  },
  {
    label: "No user interface",
    options: [
      { value: "API_BACKEND", label: "API / backend" },
      { value: "CLI_TOOL", label: "CLI tool" },
    ],
  },
  {
    label: "Other",
    options: [{ value: "OTHER", label: "Other" }],
  },
];


/** Derive a friendly project name from the input so the user doesn't have to type one
 *  up front: URL → hostname (minus www.), repo → repo name, free-text → first few words. */
function deriveProjectName(inputType: PulseScanInputType, value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (inputType === "URL") {
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      return u.hostname.replace(/^www\./i, "");
    } catch {
      return v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] || v;
    }
  }
  if (inputType === "GITHUB_REPO") {
    const parts = v.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").split("/").filter(Boolean);
    return parts[parts.length - 1] || v;
  }
  const words = v.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 0 ? words : "Untitled idea";
}

/** Smart-detect the input type from what the user pastes, so the segmented control
 *  becomes a fallback rather than a required first click. Only switches between
 *  URL ↔ GitHub repo (never auto-selects Description — that's an explicit choice). */
function detectInputType(value: string, current: PulseScanInputType): PulseScanInputType {
  if (current === "FREE_TEXT") return current;
  const v = value.trim();
  if (!v) return current;
  if (/github\.com\//i.test(v) || /^[\w.-]+\/[\w.-]+$/.test(v)) return "GITHUB_REPO";
  if (/^https?:\/\//i.test(v) || /\.[a-z]{2,}(\/|$)/i.test(v)) return "URL";
  return current;
}

type AiProviderId = "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
type Provider = { id: AiProviderId; label: string; model: string };

// Styled provider picker — a button + popover list rather than a native <select>,
// so no native chevron can leak through on top of the styled one. Falls back to a
// static label when only one provider is configured (the common case).
function ProviderSelect({
  providers,
  value,
  onChange,
  disabled,
}: {
  providers: Provider[];
  value: AiProviderId;
  onChange: (id: AiProviderId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (providers.length === 0) {
    return (
      <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-4)]">
        No provider configured — add one in Settings → Integrations
      </div>
    );
  }

  const selected = providers.find((p) => p.id === value) ?? providers[0];

  if (providers.length === 1) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5 text-sm">
        <span className="font-medium text-[var(--text-1)]">{selected.label}</span>
        <span className="truncate text-[var(--text-4)]">{selected.model}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2.5 text-sm transition hover:bg-[var(--surface-1)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-medium text-[var(--text-1)]">{selected.label}</span>
          <span className="truncate text-[var(--text-4)]">{selected.model}</span>
        </span>
        <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-[var(--text-4)] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-1 shadow-lg">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-[6px] px-3 py-2 text-left text-sm transition",
                p.id === value
                  ? "bg-[var(--brand-50)] font-medium text-[var(--brand-700)]"
                  : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
              )}
            >
              <span className="font-medium">{p.label}</span>
              <span className="text-xs text-[var(--text-4)]">{p.model}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PulseNewScanForm({
  clients,
  configuredProviders,
  activeProvider,
}: {
  clients: Array<{ id: string; name: string }>;
  configuredProviders: Provider[];
  activeProvider: AiProviderId;
}) {
  const router = useRouter();
  const { mutateAsync, isPending } = useCreatePulseScan();
  const { canGenerateAi, isPending: permsPending } = usePermissions();

  const [projectName, setProjectName] = useState("");
  const [inputType, setInputType] = useState<PulseScanInputType>("URL");
  const [inputValue, setInputValue] = useState("");
  const [platform, setPlatform] = useState("WEB_APP");
  const [clientId, setClientId] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<AiProviderId>(activeProvider);
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([""]);
  const [showCompetitors, setShowCompetitors] = useState(false);
  const [targetMarkets, setTargetMarkets] = useState<string[]>([]);
  const [projectDescription, setProjectDescription] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testPassword, setTestPassword] = useState("");
  const [showTestLogin, setShowTestLogin] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [marketQuery, setMarketQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedType = INPUT_TYPES.find((t) => t.value === inputType)!;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!inputValue.trim()) {
      setError(`Enter a ${selectedType.label.toLowerCase()} to scan.`);
      return;
    }
    // Project name is no longer required up front — derive it from the input (the
    // optional Advanced field overrides). Renamable on the scan afterward.
    const resolvedName = projectName.trim() || deriveProjectName(inputType, inputValue);

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
        projectName: resolvedName,
        inputType,
        inputUrl: resolvedUrl,
        inputGithubRepo: inputType === "GITHUB_REPO" ? inputValue.trim() : undefined,
        inputDescription: inputType === "FREE_TEXT" ? inputValue.trim() : undefined,
        platform,
        clientId: clientId || undefined,
        aiProvider: selectedProvider,
        competitorUrls: cleanedCompetitors.length > 0 ? cleanedCompetitors : undefined,
        targetMarkets: targetMarkets.length > 0 ? targetMarkets : undefined,
        projectDescription: projectDescription.trim() || undefined,
        testEmail: showTestLogin && testEmail.trim() ? testEmail.trim() : undefined,
        testPassword: showTestLogin && testPassword.trim() ? testPassword.trim() : undefined,
      });
      router.push(`/app/pulse/${result.scan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan.");
    }
  }

  const activeProviderLabel = configuredProviders.find((p) => p.id === activeProvider)?.label ?? activeProvider;

  const derivedName = deriveProjectName(inputType, inputValue);

  // Running a scan spends AI tokens — restricted to AI-generation holders (admins by default).
  // The API enforces this too; this just avoids a dead-end form for non-holders.
  if (!permsPending && !canGenerateAi) {
    return (
      <div className="app-card space-y-2 p-6 text-center sm:p-7">
        <p className="text-sm font-medium text-[var(--text-1)]">Running scans is restricted</p>
        <p className="text-sm text-[var(--text-3)]">
          Pulse scans use AI, so creating one needs the “Generate with AI” permission. Ask an admin to
          run the scan, or to grant you the permission in Settings → Team. You can still view existing scans.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="app-card space-y-5 p-6 sm:p-7">
      {/* Input type — pill segmented control */}
      <div className="inline-flex w-full rounded-full bg-[var(--surface-1)] p-1">
        {INPUT_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => { setInputType(type.value); setInputValue(""); }}
            disabled={isPending}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition",
              inputType === type.value
                ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm"
                : "text-[var(--text-3)] hover:text-[var(--text-1)]",
            )}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* The hero — a single command bar: paste a URL/repo, press ⌘↵ or Scan */}
      <div className="space-y-2">
        {inputType === "FREE_TEXT" ? (
          <>
            <textarea
              className="app-input min-h-[140px] resize-y text-base"
              placeholder={selectedType.placeholder}
              value={inputValue}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
              disabled={isPending}
              autoFocus
            />
            <Button type="submit" variant="primary" size="lg" loading={isPending} className="w-full">
              {isPending ? "Starting scan…" : "Run Pulse scan"}
            </Button>
          </>
        ) : (
          <div className="flex items-stretch gap-1.5 rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] p-1.5 shadow-sm transition focus-within:border-[var(--brand-400)] focus-within:shadow-[0_0_0_4px_var(--surface-brand-soft)]">
            <span className="flex items-center pl-2.5 text-[var(--text-4)]">
              {inputType === "GITHUB_REPO" ? <CodeBracketIcon className="h-5 w-5" /> : <GlobeAltIcon className="h-5 w-5" />}
            </span>
            <input
              className="min-w-0 flex-1 bg-transparent px-1 text-lg text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
              placeholder={selectedType.placeholder}
              value={inputValue}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const v = e.target.value;
                setInputValue(v);
                const detected = detectInputType(v, inputType);
                if (detected !== inputType) setInputType(detected);
              }}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
              }}
              disabled={isPending}
              autoFocus
              inputMode="url"
            />
            <Button type="submit" variant="primary" size="lg" loading={isPending} className="shrink-0">
              {isPending ? "Scanning…" : "Run Pulse scan"}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
          <p className="text-xs text-[var(--text-4)]">
            {derivedName
              ? <>We&apos;ll call this <span className="font-medium text-[var(--text-2)]">{derivedName}</span> — rename it any time.</>
              : selectedType.description}
          </p>
          {inputType === "URL" && !inputValue && (
            <button type="button" onClick={() => setInputValue("https://vercel.com")} className="text-xs text-[var(--brand-600)] hover:underline">
              Try an example →
            </button>
          )}
        </div>
      </div>

      {/* Platform — compact, secondary */}
      <label className="flex items-center gap-2 text-sm text-[var(--text-3)]">
        Scanning as
        <select
          className="app-select-compact w-auto"
          value={platform}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setPlatform(e.target.value)}
          disabled={isPending}
        >
          {PLATFORM_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {/* Advanced options — collapsed by default. Keeps the core form to four fields. */}
      <div className="rounded-[10px] border border-[var(--border-2)]">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          disabled={isPending}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[var(--text-2)] transition hover:text-[var(--text-1)]"
        >
          <span>Advanced options</span>
          <span className="flex items-center gap-2 text-xs font-normal text-[var(--text-4)]">
            Client, AI model, competitors, login
            <ChevronDownIcon className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
          </span>
        </button>

        {showAdvanced && (
          <div className="space-y-5 border-t border-[var(--border-2)] p-4">
            <div className="space-y-1.5">
              <label className="app-field-label">Project name (optional)</label>
              <input
                className="app-input"
                placeholder={derivedName ? `Defaults to “${derivedName}”` : "e.g. Acme CRM Dashboard"}
                value={projectName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setProjectName(e.target.value)}
                disabled={isPending}
              />
              <p className="text-xs text-[var(--text-4)]">Leave blank to name it from the URL/repo — you can rename the scan later.</p>
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

            <div className="space-y-2">
              <label className="app-field-label">Target markets (optional)</label>
              <p className="text-xs text-[var(--text-4)]">
                Which markets does this serve? We&apos;ll check each region&apos;s compliance (GDPR, CCPA…) and flag what&apos;s missing. Leave blank to auto-detect.
              </p>
              {/* Preset quick-adds */}
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(JURISDICTION_PRESETS).map(([name, codes]) => (
                  <button
                    key={name}
                    type="button"
                    disabled={isPending}
                    onClick={() => setTargetMarkets((prev) => Array.from(new Set([...prev, ...(codes as string[])])))}
                    className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:border-[var(--brand-400)]"
                  >
                    + {name}
                  </button>
                ))}
              </div>
              {/* Selected tags + filterable picker */}
              <div className="rounded-[10px] border border-[var(--border-2)] p-2">
                {targetMarkets.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {targetMarkets.map((code) => (
                      <span key={code} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-brand-soft)] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[var(--brand-700)]">
                        {(JURISDICTIONS as Record<string, { label: string }>)[code]?.label ?? code}
                        <button type="button" disabled={isPending} onClick={() => setTargetMarkets((prev) => prev.filter((c) => c !== code))} className="rounded-full p-0.5 hover:bg-[var(--brand-100)]" aria-label={`Remove ${code}`}>
                          <XMarkIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <button type="button" disabled={isPending} onClick={() => setTargetMarkets([])} className="px-1.5 text-xs text-[var(--text-4)] hover:text-[var(--text-2)]">Clear all</button>
                  </div>
                )}
                <input
                  className="w-full bg-transparent px-1 py-1 text-sm outline-none placeholder:text-[var(--text-4)]"
                  placeholder={targetMarkets.length > 0 ? "Add another market…" : "Search markets (EU, California, Japan…)"}
                  value={marketQuery}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMarketQuery(e.target.value)}
                  disabled={isPending}
                />
                {marketQuery.trim() && (() => {
                  const q = marketQuery.trim().toLowerCase();
                  const matches = JURISDICTION_CODES.filter(
                    (code) => !targetMarkets.includes(code) &&
                      (JURISDICTIONS[code].label.toLowerCase().includes(q) || JURISDICTIONS[code].primaryLaw.toLowerCase().includes(q) || code.toLowerCase().includes(q)),
                  );
                  if (matches.length === 0) return <p className="px-1 pt-1 text-xs text-[var(--text-4)]">No markets match &ldquo;{marketQuery}&rdquo;.</p>;
                  return (
                    <div className="mt-1 max-h-44 overflow-auto border-t border-[var(--border-2)] pt-1">
                      {matches.map((code) => (
                        <button
                          key={code}
                          type="button"
                          disabled={isPending}
                          onClick={() => { setTargetMarkets((prev) => [...prev, code]); setMarketQuery(""); }}
                          className="flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-left text-sm text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                        >
                          <span>{JURISDICTIONS[code].label}</span>
                          <span className="text-xs text-[var(--text-4)]">{JURISDICTIONS[code].primaryLaw}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
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
                  Helps the AI classify your product correctly, especially if the app is behind a login.
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
                    <div className="flex items-center gap-1.5 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2">
                      <span className="text-xs text-amber-700">Use a test account only. Never use your main account credentials. Credentials are discarded after the scan runs.</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="app-field-label">AI provider &amp; model</label>
              <ProviderSelect
                providers={configuredProviders}
                value={selectedProvider}
                onChange={setSelectedProvider}
                disabled={isPending}
              />
              <p className="text-xs text-[var(--text-4)]">
                {configuredProviders.length === 0
                  ? "Configure an AI provider in Settings → Integrations first."
                  : selectedProvider === activeProvider
                    ? "This is your default provider. Change it in Settings → Integrations to save a new default."
                    : `Using ${configuredProviders.find((p) => p.id === selectedProvider)?.label} for this scan only. Your default is still ${activeProviderLabel}.`}
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <p className="text-center text-xs text-[var(--text-4)]">
        500+ automated checks · security, compliance, performance & AI-app safety
      </p>
    </form>
  );
}
