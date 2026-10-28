"use client";

import { Button } from "@/components/ui/button";
import { AgentPanel } from "./agent-panel";
import type { ScanView } from "./use-scan-view";

export function renderTechnicalPanels(v: ScanView) {
  const { canRunFixAgent, creatingMonitor, fixError, fixResult, fixing, handleAutoFix, handleMonitor, handleReanalyse, inTechnical, monitorWebhookUrl, reanalyseContext, reanalyseError, reanalysing, scan, setActiveTab, setReanalyseContext, setReanalyseError, setShowReanalyseInput, showReanalyseBanner, showReanalyseInput } = v;
  return (
    <>
      {/* Agent panel */}
      {inTechnical && scan.status === "COMPLETED" && (
        <AgentPanel
          scan={scan}
          fixResult={fixResult}
          fixError={fixError}
          onAutoFix={handleAutoFix}
          fixing={fixing}
          canRunFixAgent={canRunFixAgent}
          onMonitor={handleMonitor}
          creatingMonitor={creatingMonitor}
          monitorWebhookUrl={monitorWebhookUrl}
          onDiscoverySuccess={() => setActiveTab("discovery")}
        />
      )}

      {/* AI analysis banner — shown when AI failed or returned incomplete results */}
      {showReanalyseBanner && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {scan.aiError ? (
                <>
                  <p className="font-semibold">AI analysis unavailable</p>
                  <p className="mt-0.5 text-amber-700">{scan.aiError}</p>
                  <p className="mt-0.5 text-amber-700">Technical checks and scores above are accurate.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold">AI analysis returned incomplete results</p>
                  <p className="mt-0.5 text-amber-700">Key narrative sections are empty. Regenerating may produce a better result.</p>
                </>
              )}
            </div>
            <button
              onClick={() => setShowReanalyseInput((v) => !v)}
              className="shrink-0 rounded-[8px] border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-50 disabled:opacity-50"
              disabled={reanalysing || scan.status === "RUNNING"}
            >
              {reanalysing ? "Regenerating…" : "Regenerate AI Analysis"}
            </button>
          </div>

          {showReanalyseInput && (
            <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
              <label className="block text-xs font-medium text-amber-800">
                Optional context — helps the AI produce a better result
              </label>
              <textarea
                value={reanalyseContext}
                onChange={(e) => setReanalyseContext(e.target.value)}
                placeholder="e.g. This is a B2B SaaS product for construction teams. The main concern is GDPR compliance and scalability."
                rows={3}
                className="w-full rounded-[8px] border border-amber-300 bg-white px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {reanalyseError && (
                <p className="text-xs text-red-600">{reanalyseError}</p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleReanalyse}
                  disabled={reanalysing}
                  size="sm"
                  className="bg-amber-700 text-white hover:bg-amber-800"
                >
                  {reanalysing ? "Regenerating…" : "Run Regeneration"}
                </Button>
                <button
                  onClick={() => { setShowReanalyseInput(false); setReanalyseError(null); }}
                  className="text-xs text-amber-700 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
