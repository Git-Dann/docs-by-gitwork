"use client";

import { cn } from "@/lib/format";
import type { PulseScanRecord } from "@/types/pulse";
import type { FixAgentResult } from "@/lib/api";
import { useRunBrowserAgent, useRunDiscoveryKit } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import { useStarterList } from "@/hooks/use-starters";
import { recommendStartersForScan } from "@/lib/starters-recommend";
import { useState } from "react";
import { detectStoreTarget, STORE_NAME } from "@/lib/pulse-store-url";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

export type AgentStatus = "completed" | "running" | "available" | "error" | "na";

export interface AgentSlot {
  id: string;
  label: string;
  description: string;
  status: AgentStatus;
  summary?: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const config = {
    completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
    running:   { label: "Running…",  className: "bg-blue-100 text-blue-700" },
    available: { label: "Not run",   className: "bg-[var(--surface-2)] text-[var(--text-3)]" },
    error:     { label: "Error",     className: "bg-red-100 text-red-700" },
    na:        { label: "N/A",       className: "bg-[var(--surface-1)] text-[var(--text-4)]" },
  }[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", config.className)}>
      {config.label}
    </span>
  );
}

export function AgentCard({ slot }: { slot: AgentSlot }) {
  return (
    <div className={cn(
      "flex flex-col gap-2 rounded-[10px] border p-4 transition-colors",
      slot.status === "completed" ? "border-[var(--border-2)] bg-white"
      : slot.status === "error"     ? "border-red-200 bg-red-50"
      : slot.status === "na"        ? "border-[var(--border-1)] bg-[var(--surface-1)] opacity-60"
      : "border-[var(--border-2)] bg-[var(--surface-1)]",
    )}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-1)]">{slot.label}</p>
        <AgentStatusBadge status={slot.status} />
      </div>
      <p className="text-xs text-[var(--text-3)]">{slot.summary ?? slot.description}</p>
      {slot.actionLabel && slot.onAction && slot.status !== "na" && slot.status !== "running" && (
        <button
          type="button"
          onClick={slot.onAction}
          disabled={slot.loading}
          className="mt-auto self-start rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
        >
          {slot.loading ? "Running…" : slot.actionLabel}
        </button>
      )}
    </div>
  );
}

export function AgentPanel({
  scan,
  fixResult,
  fixError,
  onAutoFix,
  fixing,
  canRunFixAgent,
  onMonitor,
  creatingMonitor,
  monitorWebhookUrl,
  onDiscoverySuccess,
}: {
  scan: PulseScanRecord;
  fixResult: FixAgentResult | null;
  fixError: string | null;
  onAutoFix: () => void;
  fixing: boolean;
  canRunFixAgent: boolean;
  onMonitor: () => void;
  creatingMonitor: boolean;
  monitorWebhookUrl: string | null;
  onDiscoverySuccess: () => void;
}) {
  const { mutateAsync: runBrowser, isPending: runningBrowser } = useRunBrowserAgent();
  const { mutateAsync: runDiscovery, isPending: runningDiscovery } = useRunDiscoveryKit();
  const { canManageStudy, canManageStarters } = usePermissions();
  // Gated fetch, same pattern as Study — only admins pay for this, and only when the slot needs it.
  const { data: allStarters } = useStarterList(canManageStarters);
  const topStarterMatch = allStarters ? recommendStartersForScan(scan, allStarters)[0] : undefined;
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [agentsOpen, setAgentsOpen] = useState(false);

  const checksTotal = scan.checks.filter((c) => c.status !== "SKIPPED").length;
  const checksFail = scan.checks.filter((c) => c.status === "FAIL").length;
  const checksPass = scan.checks.filter((c) => c.status === "PASS").length;

  const storeTarget = scan.inputUrl ? detectStoreTarget(scan.inputUrl) : null;
  // What this scan actually looked at. Each slot below is shown only where it can apply —
  // a store listing has no Lighthouse run, a repo has no hosting headers, a description has
  // no checks at all — so the panel stops advertising agents that could never run here.
  const surface = storeTarget ? "store"
    : scan.inputType === "GITHUB_REPO" ? "repo"
      : scan.inputType === "FREE_TEXT" ? "description"
        : scan.scoreBreakdown?.relevance?.target === "api" ? "api"
          : "web";
  const webProduct = ["WEB_APP", "SAAS", "MARKETING_SITE", "OTHER"].includes((scan.platform ?? "OTHER").toUpperCase());
  const slots: AgentSlot[] = [
    {
      id: "infra",
      label: surface === "store" ? "Store listing" : surface === "repo" ? "Repository checks" : surface === "api" ? "API checks" : "Website checks",
      description: surface === "store" && storeTarget
        ? `The ${STORE_NAME[storeTarget]} listing — ratings, screenshots, description, privacy declarations and links`
        : surface === "repo"
          ? "The repository's source, configuration, CI and dependencies"
          : surface === "api"
            ? "Transport, headers, exposure and API behaviour"
            : "HTTP checks, security headers, SEO, legal pages and exposure",
      status: "completed",
      summary: `${checksTotal} checks — ${checksPass} passed, ${checksFail} failed`,
    },
    // Code Intelligence
    {
      id: "code",
      label: "Code Intelligence",
      description: "GitHub GraphQL — vulnerabilities, branch protection, PR culture",
      status: scan.inputType === "GITHUB_REPO"
        ? (scan.codeInsights ? "completed" : "error")
        : "available",
      summary: scan.codeInsights
        ? `${scan.codeInsights.vulnerabilities.length === 0 ? "No vulnerabilities" : `${scan.codeInsights.vulnerabilities.length} vuln${scan.codeInsights.vulnerabilities.length !== 1 ? "s" : ""}`} · ${scan.codeInsights.commitVelocity !== null ? `${scan.codeInsights.commitVelocity} commits/wk` : "commit data"}`
        : scan.inputType === "GITHUB_REPO"
          ? "GraphQL query failed — check your GitHub token has repo read access"
          : "Rescan with a GitHub repo URL to unlock vulnerability scanning, branch protection, and commit history analysis",
      actionLabel: scan.inputType !== "GITHUB_REPO" ? "Start repo scan" : undefined,
      onAction: scan.inputType !== "GITHUB_REPO" ? () => { window.location.href = "/app/pulse"; } : undefined,
    },
    // Browser & Performance
    {
      id: "browser",
      label: "Browser & Performance",
      description: "Lighthouse via PageSpeed Insights — Core Web Vitals, accessibility, SEO scores",
      status: browserError ? "error"
        : scan.browserInsights ? "completed"
        : (scan.inputType === "URL" || (scan.inputType === "GITHUB_REPO" && scan.codeInsights?.homepageUrl))
          ? "available"
          : "na",
      summary: browserError ? browserError
        : scan.browserInsights
          ? `Performance ${scan.browserInsights.performanceScore ?? "?"}  ·  Accessibility ${scan.browserInsights.accessibilityScore ?? "?"}  ·  SEO ${scan.browserInsights.seoScore ?? "?"}`
          : scan.inputType === "URL" || (scan.inputType === "GITHUB_REPO" && scan.codeInsights?.homepageUrl)
            ? "Run Lighthouse analysis on the live site"
            : "No URL available for this scan",
      actionLabel: scan.browserInsights ? "Re-run analysis" : browserError ? "Retry" : "Run analysis",
      onAction: async () => {
        setBrowserError(null);
        try { await runBrowser(scan.id); }
        catch (err) {
          const msg = err instanceof Error ? err.message : "Browser analysis failed.";
          // Improve common PSI error messages
          const friendly = msg.includes("No data") || msg.includes("unreachable")
            ? "PageSpeed could not reach the URL — confirm it is publicly accessible (no login required) and not behind a firewall. Add a GOOGLE_PSI_API_KEY env var to avoid rate limits."
            : msg;
          setBrowserError(friendly);
        }
      },
      loading: runningBrowser,
    },
    // Deploy Intelligence
    {
      id: "deploy",
      label: "Deploy Intelligence",
      description: "Hosting & deployment intelligence — CDN layer, platform detection, build health",
      status: (() => {
        const di = scan.deployInsights;
        if (!di) return "na" as const;
        if (di.recentDeployments !== null) return "completed" as const;
        if (di.platform) return "completed" as const; // platform detected but no logs
        return "na" as const;
      })(),
      summary: (() => {
        const di = scan.deployInsights;
        if (!di?.platform) return "Hosting platform not identified from HTTP headers";
        const platformName: Record<string, string> = {
          vercel: "Vercel", netlify: "Netlify", railway: "Railway", other: "External hosting",
        };
        const name = platformName[di.platform] ?? di.platform;
        if (di.recentDeployments === null) return `${name} detected — deployment logs not available`;
        return `${name} · ${di.recentDeployments} deployments · ${di.avgBuildMs !== null ? `${Math.round(di.avgBuildMs / 1000)}s avg build` : "build data unavailable"}`;
      })(),
    },
    // AI Synthesis
    {
      id: "ai",
      label: "AI Synthesis",
      description: "LLM analysis — project classification, gaps, roadmap",
      status: scan.llmAnalysis ? "completed" : scan.aiError ? "error" : "available",
      summary: scan.llmAnalysis
        ? `${scan.llmAnalysis.projectClassification.type}${scan.llmAnalysis.projectClassification.subtype ? ` · ${scan.llmAnalysis.projectClassification.subtype}` : ""} · ${scan.llmAnalysis.criticalGaps.length} critical gap${scan.llmAnalysis.criticalGaps.length !== 1 ? "s" : ""}`
        : scan.aiError ?? "AI synthesis did not run",
    },
    // Discovery Prep
    {
      id: "discovery",
      label: "Discovery Prep",
      description: "AI-generated call guide — questions, objections, pricing anchor",
      status: discoveryError ? "error"
        : scan.discoveryKit ? "completed"
        : scan.llmAnalysis && scan.inputType !== "FREE_TEXT" ? "available"
        : "na",
      summary: discoveryError ? discoveryError
        : scan.discoveryKit
          ? `${scan.discoveryKit.questions.length} questions · pricing £${scan.discoveryKit.pricingAnchor.low.toLocaleString()}–£${scan.discoveryKit.pricingAnchor.high.toLocaleString()}`
          : scan.llmAnalysis && scan.inputType !== "FREE_TEXT"
            ? "Generate a tailored discovery call briefing"
            : "Requires AI synthesis to complete first",
      actionLabel: scan.discoveryKit ? "Regenerate" : discoveryError ? "Retry" : "Generate",
      onAction: async () => {
        setDiscoveryError(null);
        try {
          await runDiscovery(scan.id);
          onDiscoverySuccess();
        } catch (err) {
          setDiscoveryError(err instanceof Error ? err.message : "Discovery kit generation failed. Check your AI provider settings.");
        }
      },
      loading: runningDiscovery,
    },
    // Auto-fix
    {
      id: "fix",
      label: "Auto-fix",
      description: "AI reads your repo files and opens a GitHub PR with targeted fixes",
      status: fixError ? "error" : fixResult ? "completed" : "available",
      summary: fixError
        ? fixError
        : fixResult
          ? fixResult.summary
          : scan.inputType === "GITHUB_REPO"
            ? `Fix the ${scan.checks.filter((c) => c.status === "FAIL").length} failing checks automatically`
            : "Rescan with a GitHub repo URL — AI will read your code and open a PR fixing failing checks",
      actionLabel: fixError ? "Retry"
        : fixResult?.prUrl ? "View PR"
        : scan.inputType === "GITHUB_REPO" ? "Run fix agent"
        : "Start repo scan",
      onAction: fixResult?.prUrl
        ? () => window.open(fixResult.prUrl!, "_blank")
        : scan.inputType !== "GITHUB_REPO"
          ? () => { window.location.href = "/app/pulse"; }
          : onAutoFix,
      loading: fixing,
    },
    // Monitor
    {
      id: "monitor",
      label: "Monitor",
      description: "Webhook triggered re-scan on every new deployment — alerts on score drops",
      status: monitorWebhookUrl ? "completed" : "available",
      summary: monitorWebhookUrl
        ? `Webhook active — register in your CI/CD pipeline`
        : "Get alerted when your health score drops after a deploy",
      actionLabel: monitorWebhookUrl ? undefined : "Set up monitor",
      onAction: onMonitor,
      loading: creatingMonitor,
    },
    // Research study (optional, admin-only) — interview AI personas to validate this scan's
    // assumptions. The slot itself is filtered out below unless the viewer can use Study.
    {
      id: "study",
      label: "Research study",
      description: "AI persona interviews to test assumptions this scan raised — optional, not automatic",
      status: scan.linkedStudyId ? "completed" : "available",
      summary: scan.linkedStudyId
        ? "A research study is linked to this scan"
        : "Launch a study, pre-filled from this scan's gaps and opportunities",
      actionLabel: scan.linkedStudyId ? "View study" : "Start research study",
      onAction: scan.linkedStudyId
        ? () => { window.location.href = `/app/study/${scan.linkedStudyId}`; }
        : () => { window.location.href = `/app/study/new?scanId=${scan.id}`; },
    },
    // Starters (optional, admin-only) — Gitwork's Prompt→Production library. Browse building
    // blocks pre-filtered to this scan; adopting one links it back here. Filtered out below
    // unless the viewer can use Starters.
    {
      id: "starters",
      label: "Starters",
      description: "Gitwork prompts, skills, plugins and kits to leap this project forward — optional",
      status: scan.linkedStarterId ? "completed" : "available",
      summary: scan.linkedStarterId
        ? "A starter is linked to this scan"
        : topStarterMatch
          ? `Top pick: ${topStarterMatch.starter.name} (matches ${topStarterMatch.reasons.slice(0, 3).join(", ")})`
          : "Browse the Prompt→Production library, recommended for this project",
      actionLabel: scan.linkedStarterId ? "View starter" : "Browse starters",
      onAction: scan.linkedStarterId
        ? () => { window.location.href = `/app/starters/${scan.linkedStarterId}`; }
        : () => { window.location.href = `/app/starters?scanId=${scan.id}`; },
    },
  ];

  // High-risk: the fix-agent opens GitHub PRs — hide that slot unless the role holds pulse.fixAgent.
  // Study + Starters are admin-only tools — hide their slots from everyone else.
  const visibleSlots = slots.filter(
    (slot) =>
      (slot.id !== "fix" || canRunFixAgent) &&
      (slot.id !== "study" || canManageStudy) &&
      (slot.id !== "starters" || canManageStarters) &&
      // Contextual: only the agents that can run against THIS scan's surface.
      (slot.id !== "infra" || surface !== "description") &&
      (slot.id !== "browser" || (surface === "web" && webProduct)) &&
      (slot.id !== "deploy" || Boolean(scan.deployInsights?.platform || scan.deployInsights?.recentDeployments != null)) &&
      (slot.id !== "monitor" || surface !== "description"),
  );

  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-5 py-4">
      <button
        type="button"
        onClick={() => setAgentsOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          {agentsOpen ? <ChevronDownIcon className="h-4 w-4 text-[var(--text-4)]" /> : <ChevronRightIcon className="h-4 w-4 text-[var(--text-4)]" />}
          <span className="text-sm font-semibold text-[var(--text-1)]">Scan agents</span>
          <span className="text-xs text-[var(--text-4)]">
            · {visibleSlots.filter((s) => s.status === "completed").length}/{visibleSlots.filter((s) => s.status !== "na").length} run
          </span>
        </span>
        {!agentsOpen && (
          <span className="text-xs font-medium text-[var(--brand-600)]">Run more checks →</span>
        )}
      </button>
      {agentsOpen && (
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleSlots.map((slot) => (
          <AgentCard key={slot.id} slot={slot} />
        ))}
      </div>
      )}
      {agentsOpen && monitorWebhookUrl && (
        <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-white p-3">
          <span className="text-xs text-[var(--text-3)]">Webhook URL:</span>
          <code className="flex-1 truncate rounded bg-[var(--surface-1)] px-2 py-1 font-mono text-[11px] text-[var(--text-2)]">
            {monitorWebhookUrl}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(monitorWebhookUrl)}
            className="text-xs text-[var(--brand-600)] hover:underline"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
