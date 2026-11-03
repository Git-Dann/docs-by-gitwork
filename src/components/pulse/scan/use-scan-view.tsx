"use client";

import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/use-permissions";
import { useEffect, useRef, useState } from "react";
import { useCreateMonitor, useCreatePulseScan, useEmailPulseAudit, useGeneratePulseProposal, usePulseBenchmarks, usePulseFindings, usePulseScanDiff, usePulseScanHistory, useReanalysePulseScan, useRenamePulseScan, useRunFixAgent, useSendPulseFindingToBoard, useSharePulseScan, useUnsharePulseScan } from "@/hooks/use-pulse";
import { buildFindings, countByView } from "@/lib/pulse-findings";
import { computeGrades } from "@/server/pulse-checks/grades";
import type { FixAgentResult } from "@/lib/api";
import type { GateEvaluationRecord, PulseScanCheckInput, PulseScanCheckRecord, PulseScanRecord } from "@/types/pulse";
import { evaluateReleaseGate, resolveGatePolicy } from "@/server/pulse-checks/release-decision";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import type { DocumentCoverMeta, DocumentCoverStat } from "@/components/document-cover";
import { describeScanSubject } from "@/lib/pulse-store-url";
import { GATE_LABEL } from "@/components/pulse/release-gate-banner";
import { STATUS_WORDS } from "@/lib/pulse-status-words";
import { PRIMARY_OF, type PrimaryTab, type Tab, effectiveTechStack, groupChecksByCategory } from "./scan-helpers";

/**
 * Everything the scan page computes before it renders: state, data, and the derived values the
 * tabs read. Split out of pulse-scan-results.tsx unchanged; the page and its tab renderers read
 * the returned object (`ScanView`).
 */
export function useScanView(scan: PulseScanRecord) {
  const router = useRouter();
  const { canRunFixAgent, isExternal, canManagePulse } = usePermissions();
  const [checksView, setChecksView] = useState<"findings" | "all">("findings");
  const { data: findingData } = usePulseFindings(scan.id, scan.status === "COMPLETED");
  // Two actions on this bar act AS Gitwork rather than on the scan, so a guest gets
  // neither: "Generate proposal" writes a Document into our Docs workspace (a module
  // they do not hold — the route now refuses it, and offering a button that refuses is
  // worse than not offering it), and "Email audit" sends from Gitwork's own email
  // infrastructure to any address typed into the box, which puts our domain reputation
  // behind a message we never saw.
  const canActAsAgency = !isExternal;
  const { data: benchmarkData } = usePulseBenchmarks(scan.id, scan.status === "COMPLETED");
  const benchmark = benchmarkData?.benchmarks ?? null;
  const { data: historyData } = usePulseScanHistory(scan.id, scan.status === "COMPLETED");
  const scoreHistory = (historyData?.history ?? []).filter((h) => typeof h.healthScore === "number");
  const { data: diffData } = usePulseScanDiff(scan.id, scan.status === "COMPLETED");
  const scanDiff = diffData?.diff ?? null;
  // Open findings for the tab badge: the same rule the Findings list applies.
  const scanFindings = buildFindings(
    scan.checks,
    findingData?.states ?? [],
    findingData?.tasks ?? [],
    new Set((scanDiff?.fixed ?? []).map((d) => d.checkKey)),
  );
  const openFindingCount = countByView(scanFindings).open;
  const findingByKey = new Map(scanFindings.map((f) => [f.check.checkKey, f]));
  const grades = computeGrades(scan.checks);
  const { mutateAsync: createScan, isPending: rescanning } = useCreatePulseScan();
  const { mutateAsync: shareScan, isPending: sharing } = useSharePulseScan();
  const { mutateAsync: unshareScan, isPending: unsharing } = useUnsharePulseScan();
  const { mutateAsync: runFix, isPending: fixing } = useRunFixAgent();
  const { mutateAsync: addMonitor, isPending: creatingMonitor } = useCreateMonitor();
  const { mutateAsync: reanalyse, isPending: reanalysing } = useReanalysePulseScan();
  const { mutateAsync: generateProposal, isPending: generatingProposal } = useGeneratePulseProposal();
  const { mutateAsync: emailAudit, isPending: emailing } = useEmailPulseAudit();
  const { mutate: renameScan } = useRenamePulseScan();
  const [proposalGenError, setProposalGenError] = useState<string | null>(null);
  const [pdfPending, setPdfPending] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  // `?tab=findings` (from the Projects list's urgent count) opens straight on the findings.
  // Read after mount, not in the initialiser: the page is server-rendered too.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "findings") setActiveTab("checks");
  }, []);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(scan.shareToken);
  const [isShared, setIsShared] = useState(scan.isShared);
  const [fixResult, setFixResult] = useState<FixAgentResult | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [monitorWebhookUrl, setMonitorWebhookUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [reanalyseContext, setReanalyseContext] = useState("");
  const [reanalyseError, setReanalyseError] = useState<string | null>(null);
  const [showReanalyseInput, setShowReanalyseInput] = useState(false);
  const [discoveryExpanded, setDiscoveryExpanded] = useState(false);
  const [checkStatusFilter, setCheckStatusFilter] = useState<"ALL" | "FAIL" | "WARN" | "INCONCLUSIVE" | "PASS">("ALL");
  const [pricingTier, setPricingTier] = useState(2); // selected team size for the engagement estimate
  const [checksSortBySeverity, setChecksSortBySeverity] = useState(false);
  // Cover title is editable (see the Hero below) — local state for responsive typing,
  // debounced-saved via renameScan so we don't fire a PATCH on every keystroke.
  const [scanTitle, setScanTitle] = useState(scan.projectName);
  const renameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "+ Task" in the by-category view goes through the same findings write as the
  // Findings list, so both record a PulseFindingState and show the same state.
  const sendFinding = useSendPulseFindingToBoard(scan.id);
  const [pendingCheckKey, setPendingCheckKey] = useState<string | null>(null);

  async function addCheckTask(check: PulseScanCheckRecord) {
    setPendingCheckKey(check.checkKey);
    try {
      await sendFinding.mutateAsync(check.checkKey);
    } catch {
      /* swallow — button stays actionable */
    } finally {
      setPendingCheckKey(null);
    }
  }

  // Keep local share state in sync when the scan is re-fetched externally
  useEffect(() => {
    setShareToken(scan.shareToken);
    setIsShared(scan.isShared);
  }, [scan.shareToken, scan.isShared]);

  useEffect(() => {
    setScanTitle(scan.projectName);
  }, [scan.projectName]);

  useEffect(() => {
    return () => {
      if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
    };
  }, []);

  function handleTitleChange(next: string) {
    setScanTitle(next);
    if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
    renameTimeoutRef.current = setTimeout(() => {
      const trimmed = next.trim();
      if (trimmed && trimmed !== scan.projectName) {
        renameScan({ scanId: scan.id, projectName: trimmed });
      }
    }, 800);
  }

  function toggleCategory(category: string) {
    setExpandedCategories((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const llm = scan.llmAnalysis;
  const checksByCategory = groupChecksByCategory(scan.checks);

  // ── Adaptive visibility ──────────────────────────────────────────────────────
  // Only surface widgets relevant to THIS product: a described idea has no checks
  // or live-site signals; a GitHub-only scan has no web vitals / screenshot; a URL
  // scan can prompt to add a repo. Server-side platform filtering already trims
  // irrelevant check categories — this trims the overview widgets to match.
  const isUrlScan = scan.inputType === "URL";
  const techStackInfo = effectiveTechStack(scan);                        // 05 (with builder/AI fallback)
  const showTechStack = techStackInfo.stack.length > 0;
  const showWebVitals = !!scan.browserInsights || isUrlScan;             // 07 (data, or an actionable prompt on URL scans)
  const showCodeIntel = !!scan.codeInsights;                            // 09
  // 10 — only when there's REAL deploy data; "platform detected, no metrics" is an
  // empty card (that signal already lives in the Scan-agents panel).
  const showDeployIntel = !!(
    scan.deployInsights &&
    (scan.deployInsights.recentDeployments !== null ||
      scan.deployInsights.avgBuildMs !== null ||
      (scan.deployInsights.buildWarnings?.length ?? 0) > 0)
  );
  // Paired rows go single-column when only one card shows, so a lone card never
  // leaves a half-width gap on the right.
  const techVitalsBoth = showTechStack && showWebVitals;
  const codeDeployBoth = showCodeIntel && showDeployIntel;

  // Detect incomplete AI analysis — key fields empty despite no hard error
  const isAnalysisIncomplete =
    !scan.aiError &&
    llm !== null &&
    llm !== undefined &&
    llm.criticalGaps.length === 0 &&
    llm.buildOpportunities.length === 0 &&
    (!llm.proposalHook || llm.proposalHook.trim() === "") &&
    (!llm.executiveSummary || llm.executiveSummary.trim() === "");

  const showReanalyseBanner = Boolean(scan.aiError) || isAnalysisIncomplete;

  async function handleReanalyse() {
    setReanalyseError(null);
    try {
      await reanalyse({ scanId: scan.id, context: reanalyseContext.trim() || undefined });
      setReanalyseContext("");
      setShowReanalyseInput(false);
    } catch (err) {
      setReanalyseError(err instanceof Error ? err.message : "Regeneration failed. Please try again.");
    }
  }

  const reportUrl = shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/report/${shareToken}` : null;

  async function handleShare() {
    setShareError(null);
    try {
      const result = await shareScan(scan.id);
      setShareToken(result.shareToken);
      setIsShared(true);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Failed to generate share link.");
    }
  }

  // Branded PDF — the route needs the scan shared (token-auth), so auto-share first.
  async function handleDownloadPdf() {
    setPdfPending(true);
    try {
      if (!isShared) {
        const result = await shareScan(scan.id);
        setShareToken(result.shareToken);
        setIsShared(true);
      }
      window.open(`/api/pulse/scans/${scan.id}/pdf`, "_blank");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Couldn't prepare the PDF.");
    } finally {
      setPdfPending(false);
    }
  }

  async function handleSendEmail() {
    setEmailError(null);
    try {
      await emailAudit({ scanId: scan.id, to: emailTo.trim(), message: emailMsg.trim() || undefined });
      setEmailSent(true);
      setIsShared(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Couldn't send the email.");
    }
  }

  async function handleUnshare() {
    setShareError(null);
    try {
      await unshareScan(scan.id);
      setShareToken(null);
      setIsShared(false);
      setCopied(false);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Failed to revoke share link.");
    }
  }

  function handleCopy() {
    if (!reportUrl) return;
    navigator.clipboard.writeText(reportUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleMonitor() {
    const result = await addMonitor({
      projectName: scan.projectName,
      inputType: scan.inputType,
      inputUrl: scan.inputUrl ?? undefined,
      inputGithubRepo: scan.inputGithubRepo ?? undefined,
      clientId: scan.clientId ?? undefined,
    });
    setMonitorWebhookUrl(result.monitor.webhookUrl);
  }

  async function handleAutoFix() {
    setFixError(null);
    try {
      const result = await runFix(scan.id);
      setFixResult(result);
    } catch (err) {
      setFixError(err instanceof Error ? err.message : "Fix agent failed. Check your configuration and try again.");
    }
  }

  async function handleRescan() {
    const result = await createScan({
      projectName: scan.projectName,
      inputType: scan.inputType,
      inputUrl: scan.inputUrl ?? undefined,
      inputGithubRepo: scan.inputGithubRepo ?? undefined,
      inputDescription: scan.inputDescription ?? undefined,
      clientId: scan.clientId ?? undefined,
    });
    router.push(`/app/pulse/${result.scan.id}`);
  }

  // D3 — re-scan with the AI's suggested competitor benchmarks (max 3, per validator).
  const [benchmarking, setBenchmarking] = useState(false);
  async function handleBenchmarkSuggestions() {
    const urls = (llm?.competitorSuggestions ?? [])
      .map((s) => s.url.trim())
      .filter((u) => /^https?:\/\//i.test(u) || /\./.test(u))
      .slice(0, 3);
    if (urls.length === 0) return;
    setBenchmarking(true);
    try {
      const result = await createScan({
        projectName: scan.projectName,
        inputType: scan.inputType,
        inputUrl: scan.inputUrl ?? undefined,
        inputGithubRepo: scan.inputGithubRepo ?? undefined,
        inputDescription: scan.inputDescription ?? undefined,
        clientId: scan.clientId ?? undefined,
        competitorUrls: urls,
      });
      router.push(`/app/pulse/${result.scan.id}`);
    } finally {
      setBenchmarking(false);
    }
  }

  async function handleGenerateProposal() {
    setProposalGenError(null);
    try {
      const result = await generateProposal(scan.id);
      router.push(`/app/docs/${result.proposalId}`);
    } catch (err) {
      setProposalGenError(err instanceof Error ? err.message : "Failed to generate proposal.");
    }
  }


  const scorecard = scan.complianceScorecard ?? [];
  const complianceMissing = scorecard.reduce((n, e) => n + e.failing, 0);
  const primary = PRIMARY_OF[activeTab];
  const inSummary = primary === "summary";
  const inTechnical = primary === "technical";
  const tabs: Array<{ id: PrimaryTab; to: Tab; label: string; count?: number; badgeColor?: "red" | "amber" }> = [
    { id: "summary", to: "overview", label: "Summary" },
    { id: "checks", to: "checks", label: "Findings", count: openFindingCount || undefined, badgeColor: "red" as const },
    { id: "plan", to: "opportunities", label: "Plan" },
    { id: "technical", to: "technical", label: "Technical" },
  ];
  // The plan's parts, as one row of choices inside the Plan tab rather than five more tabs.
  const planParts: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "opportunities", label: "Opportunities", count: llm?.buildOpportunities.length },
    { id: "roadmap", label: "Roadmap", count: llm?.scalingRoadmap.length },
    { id: "stack", label: "Stack", count: llm?.techStackAnalysis?.recommendations.length },
    // The commercial read (effort, price, intake risk). Blockers, gaps and the readiness
    // checklist used to live here too; they repeated the findings, so they are gone.
    { id: "readiness", label: "Estimate" },
  ];

  // Sequential section numbering — increments only for sections that actually
  // render, in source/display order, so hidden widgets (no deploy data, no repo)
  // never leave a gap like "07 · 08 · 11". Reset every render.
  let __sectionNo = 0;
  const sectionNo = () => String(++__sectionNo).padStart(2, "0");

  // Prefer the decision stored with the scan — it is the one that knew which
  // collectors ran, which cannot be recovered from the checks. Failing that,
  // derive it from the same pure engine, so a scan run before the gate existed
  // still gets a decision rather than a blank space where one should be. What
  // is never done is inventing a permissive default: a scan with no checks at
  // all yields no banner rather than a quiet pass.
  const gate: GateEvaluationRecord | undefined = scan.scoreBreakdown?.gate
    ?? (scan.checks.length > 0
      ? evaluateReleaseGate(
        scan.checks as unknown as PulseScanCheckInput[],
        scan.scoreBreakdown ?? computeScoreBreakdown(scan.checks as unknown as PulseScanCheckInput[]),
        // The same policy the scan was judged by — a store link as the app it lists.
        resolveGatePolicy({
          targetUrl: scan.inputUrl,
          inputType: scan.inputType,
          platform: scan.platform,
          apiTarget: scan.scoreBreakdown?.relevance?.target === "api",
        }),
      )
      : undefined);

  // ── Hero — Gitwork navy DocumentCover, reused in its compact "screen" variant (the same
  // component/props shape that renders the printable report's navy cover). Replaces the old
  // header row's plain ScoreRing + the Overview tab's standalone "01 // PROJECT HEALTH" widget,
  // so there's one canonical score-ring render and one primary stat strip instead of three. ──
  const heroDated = scan.completedAt
    ? `Scanned ${new Date(scan.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
    : `Scanned ${new Date(scan.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
  const heroMeta: DocumentCoverMeta[] = [];
  // What was assessed, first: an App Store link is an iOS app and is reported as one.
  const subject = describeScanSubject(scan.inputUrl, scan.platform);
  if (subject) heroMeta.push({ label: "Platform", value: subject });
  if (llm?.projectClassification) {
    heroMeta.push({
      label: "Classification",
      value: llm.projectClassification.subtype
        ? `${llm.projectClassification.type} · ${llm.projectClassification.subtype}`
        : llm.projectClassification.type,
    });
  }
  // Readiness comes from the deterministic release gate when the scan has one.
  //
  // It used to be a fourth ad-hoc formula — `healthScore >= 80 && criticalBlockers
  // === 0` — where `criticalBlockers` counted entries in `llm.productionBlockers`,
  // i.e. MODEL OUTPUT. A release verdict derived from generated prose is a guess
  // in a confident voice, and it could disagree with the deterministic checks on
  // the same page. Scans predating the gate keep the old wording, since there is
  // no decision to show and inventing one would be worse.
  if (gate) {
    heroMeta.push({ label: "Release", value: GATE_LABEL[gate.decision] });
  } else if (scan.healthScore !== null) {
    const criticalBlockers = (llm?.productionBlockers ?? []).filter((b) => b.urgency === "CRITICAL").length;
    const ready = scan.healthScore >= 80 && criticalBlockers === 0;
    const nearly = !ready && scan.healthScore >= 55 && criticalBlockers <= 2;
    heroMeta.push({ label: "Readiness", value: ready ? "Launch-ready" : nearly ? "Nearly there" : "Not launch-ready" });
  }
  if (scan.previousHealthScore !== null && scan.healthScore !== null && scan.healthScore !== scan.previousHealthScore) {
    const delta = scan.healthScore - scan.previousHealthScore;
    heroMeta.push({ label: "Trend", value: `${delta > 0 ? "+" : ""}${delta} vs last scan` });
  }
  const heroStats: DocumentCoverStat[] = [
    { count: scan.checks.filter((c) => c.status === "FAIL").length, label: STATUS_WORDS.FAIL, color: "#dc2626", bg: "#fef2f2" },
    { count: scan.checks.filter((c) => c.status === "WARN").length, label: STATUS_WORDS.WARN, color: "#d97706", bg: "#fffbeb" },
    { count: scan.checks.filter((c) => c.status === "PASS").length, label: STATUS_WORDS.PASS, color: "#16a34a", bg: "#f0fdf4" },
    { count: scan.checks.filter((c) => c.status === "INCONCLUSIVE").length, label: STATUS_WORDS.INCONCLUSIVE, color: "#475569", bg: "#FAFAF9" },
  ];

  return {
    scan,
    router,
    canRunFixAgent,
    isExternal,
    canManagePulse,
    checksView,
    setChecksView,
    findingData,
    canActAsAgency,
    benchmarkData,
    benchmark,
    historyData,
    scoreHistory,
    diffData,
    scanDiff,
    scanFindings,
    openFindingCount,
    findingByKey,
    grades,
    createScan,
    rescanning,
    shareScan,
    sharing,
    unshareScan,
    unsharing,
    runFix,
    fixing,
    addMonitor,
    creatingMonitor,
    reanalyse,
    reanalysing,
    generateProposal,
    generatingProposal,
    emailAudit,
    emailing,
    renameScan,
    proposalGenError,
    setProposalGenError,
    pdfPending,
    setPdfPending,
    emailModalOpen,
    setEmailModalOpen,
    emailTo,
    setEmailTo,
    emailMsg,
    setEmailMsg,
    emailSent,
    setEmailSent,
    emailError,
    setEmailError,
    activeTab,
    setActiveTab,
    expandedCategories,
    setExpandedCategories,
    copied,
    setCopied,
    shareToken,
    setShareToken,
    isShared,
    setIsShared,
    fixResult,
    setFixResult,
    fixError,
    setFixError,
    monitorWebhookUrl,
    setMonitorWebhookUrl,
    shareError,
    setShareError,
    reanalyseContext,
    setReanalyseContext,
    reanalyseError,
    setReanalyseError,
    showReanalyseInput,
    setShowReanalyseInput,
    discoveryExpanded,
    setDiscoveryExpanded,
    checkStatusFilter,
    setCheckStatusFilter,
    pricingTier,
    setPricingTier,
    checksSortBySeverity,
    setChecksSortBySeverity,
    scanTitle,
    setScanTitle,
    renameTimeoutRef,
    sendFinding,
    pendingCheckKey,
    setPendingCheckKey,
    addCheckTask,
    handleTitleChange,
    toggleCategory,
    llm,
    checksByCategory,
    isUrlScan,
    techStackInfo,
    showTechStack,
    showWebVitals,
    showCodeIntel,
    showDeployIntel,
    techVitalsBoth,
    codeDeployBoth,
    isAnalysisIncomplete,
    showReanalyseBanner,
    handleReanalyse,
    reportUrl,
    handleShare,
    handleDownloadPdf,
    handleSendEmail,
    handleUnshare,
    handleCopy,
    handleMonitor,
    handleAutoFix,
    handleRescan,
    benchmarking,
    setBenchmarking,
    handleBenchmarkSuggestions,
    handleGenerateProposal,
    scorecard,
    complianceMissing,
    primary,
    inSummary,
    inTechnical,
    tabs,
    planParts,
    sectionNo,
    gate,
    heroDated,
    heroMeta,
    subject,
    heroStats,
  };
}

export type ScanView = ReturnType<typeof useScanView>;
