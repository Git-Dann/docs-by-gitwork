export const metadata = {
  title: "API Reference — Docs by Gitwork",
  description: "REST API documentation for Docs by Gitwork",
};

const BASE_URL = "https://docs-by-gitwork.vercel.app";

interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  auth: boolean;
  params?: Param[];
  body?: Param[];
  response: string;
  notes?: string;
}

const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/health",
    description: "Health check — confirms the service is running.",
    auth: false,
    response: `{ "ok": true, "service": "docs-by-gitwork", "version": "0.1.0", "timestamp": "2026-03-31T00:00:00.000Z" }`,
  },
  {
    method: "GET",
    path: "/api/proposals",
    description: "List all proposals.",
    auth: true,
    response: `{ "proposals": [{ "id": "...", "title": "...", "status": "DRAFT", "clientName": "...", "updatedAt": "..." }] }`,
  },
  {
    method: "GET",
    path: "/api/clients",
    description: "List suggested clients inferred from proposal metadata, including drafts.",
    auth: true,
    response: `{ "clients": [{ "id": "client_acme-health", "name": "Acme Health", "slug": "acme-health", "proposalCount": 3, "source": "SUGGESTED" }] }`,
  },
  {
    method: "GET",
    path: "/api/clients/:slug",
    description: "Get a suggested client with linked proposals and proof documents.",
    auth: true,
    params: [{ name: "slug", type: "string", required: true, description: "Client slug" }],
    response: `{ "client": { "id": "...", "name": "...", "slug": "...", "proposalCount": 3, "source": "SUGGESTED" }, "proposals": [{ "id": "...", "title": "...", "status": "DRAFT" }], "proofDocuments": [] }`,
  },
  {
    method: "POST",
    path: "/api/proposals",
    description: "Create a new proposal.",
    auth: true,
    body: [
      { name: "title", type: "string", required: true, description: "Proposal title" },
      { name: "clientName", type: "string", required: false, description: "Suggested client name to attach to the proposal" },
      { name: "productName", type: "string", required: false, description: "Product or project name shown throughout the proposal" },
      { name: "templateId", type: "string", required: false, description: "ID of a template to apply" },
    ],
    response: `{ "proposal": { "id": "...", "title": "...", "status": "DRAFT", ... } }`,
  },
  {
    method: "GET",
    path: "/api/proposals/:id",
    description: "Get a single proposal with all sections.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    response: `{ "proposal": { "id": "...", "title": "...", "status": "DRAFT", "cover": {...}, "engagement": {...}, "timeline": [...], "costing": {...} } }`,
  },
  {
    method: "PATCH",
    path: "/api/proposals/:id",
    description: "Update top-level proposal fields.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    body: [
      { name: "title", type: "string", required: false, description: "New title" },
      { name: "status", type: "DocumentStatus", required: false, description: "DRAFT | PRODUCT_SIGN_OFF | TECH_SIGN_OFF | IN_REVIEW | APPROVED | SENT | ARCHIVED" },
    ],
    response: `{ "proposal": { "id": "...", "title": "...", "status": "...", ... } }`,
  },
  {
    method: "POST",
    path: "/api/proposals/:id/duplicate",
    description: "Duplicate a proposal (copies all sections as a new DRAFT).",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Source proposal CUID" }],
    response: `{ "proposal": { "id": "...", "title": "Copy of ...", "status": "DRAFT", ... } }`,
  },
  {
    method: "POST",
    path: "/api/proposals/:id/archive",
    description: "Archive a proposal (sets status to ARCHIVED).",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    response: `{ "proposal": { "id": "...", "status": "ARCHIVED" } }`,
  },
  {
    method: "DELETE",
    path: "/api/proposals/:id/delete",
    description: "Permanently delete a proposal.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    response: `{ "ok": true }`,
  },
  {
    method: "POST",
    path: "/api/proposals/:id/engagement",
    description: "Update the engagement section (scope, deliverables, objectives).",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    body: [
      { name: "ctas", type: "CTA[]", required: true, description: "Call-to-action buttons for the engagement section" },
      { name: "links", type: "Link[]", required: true, description: "Supporting links for decks, docs, routes, or email actions" },
    ],
    response: `{ "proposal": { "id": "...", "links": [...], "ctas": [...], ... } }`,
  },
  {
    method: "POST",
    path: "/api/proposals/:id/timeline",
    description: "Replace the timeline phases for a proposal.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    body: [
      { name: "timelinePhases", type: "Phase[]", required: true, description: "Array of { name, duration, summary, deliverables, viewMode } objects" },
      { name: "viewMode", type: "LIST | MILESTONE", required: false, description: "Preferred timeline presentation mode" },
    ],
    response: `{ "proposal": { "id": "...", "timelinePhases": [...], ... } }`,
  },
  {
    method: "POST",
    path: "/api/proposals/:id/costing",
    description: "Update costing line items for a proposal.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    body: [
      { name: "costLineItems", type: "CostItem[]", required: true, description: "Array of costing rows with quantity, rate, and subtotal data" },
    ],
    response: `{ "proposal": { "id": "...", "costLineItems": [...], ... } }`,
  },
  {
    method: "POST",
    path: "/api/proposals/:id/export",
    description: "Create an export record for print, PDF, or share-link output.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    body: [
      { name: "format", type: "PRINT | PDF | SHARE_LINK", required: true, description: "Export format to prepare" },
      { name: "settings", type: "object", required: false, description: "Optional export settings persisted on the export record" },
    ],
    response: `{ "export": { "id": "...", "format": "PDF", "status": "PENDING", "url": "/app/proposals/:id/print", "requestedAt": "..." } }`,
  },
  {
    method: "GET",
    path: "/api/rate-card/people",
    description: "List the shared People & Rates roster used by Axis and other connected clients.",
    auth: true,
    response: `{ "people": [{ "id": "...", "workspaceId": "...", "seedIdentifier": "gitwork.aashir-awan", "name": "Aashir Awan", "area": "Senior • Flutter, Frontend, Backend, DevOps", "sourceRate": 1900, "sourceCurrencyCode": "USD", "billingPeriod": "MONTH", "archivedAt": null, "createdAt": "...", "updatedAt": "..." }] }`,
    notes: "Supports optional query params `search` and `includeArchived=true`.",
  },
  {
    method: "POST",
    path: "/api/rate-card/people",
    description: "Create a new shared People & Rates roster entry.",
    auth: true,
    body: [
      { name: "name", type: "string", required: true, description: "Display name for the person" },
      { name: "area", type: "string", required: true, description: "Discipline, specialty, or role summary" },
      { name: "sourceRate", type: "number", required: true, description: "Stored source rate in the source currency" },
      { name: "sourceCurrencyCode", type: "string", required: true, description: "3-letter ISO currency code such as USD or GBP" },
      { name: "billingPeriod", type: "DAY | WEEK | MONTH", required: true, description: "Source billing period used to interpret the stored rate" },
    ],
    response: `{ "person": { "id": "...", "name": "New Person", "area": "Design", "sourceRate": 650, "sourceCurrencyCode": "GBP", "billingPeriod": "DAY", "archivedAt": null, "createdAt": "...", "updatedAt": "..." } }`,
  },
  {
    method: "GET",
    path: "/api/rate-card/people/:id",
    description: "Fetch a single People & Rates roster entry.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Rate-card person CUID" }],
    response: `{ "person": { "id": "...", "name": "...", "area": "...", "sourceRate": 650, "sourceCurrencyCode": "GBP", "billingPeriod": "DAY", "archivedAt": null, "createdAt": "...", "updatedAt": "..." } }`,
  },
  {
    method: "PATCH",
    path: "/api/rate-card/people/:id",
    description: "Update one or more fields on a People & Rates roster entry.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Rate-card person CUID" }],
    body: [
      { name: "name", type: "string", required: false, description: "Updated display name" },
      { name: "area", type: "string", required: false, description: "Updated discipline or role summary" },
      { name: "sourceRate", type: "number", required: false, description: "Updated source rate" },
      { name: "sourceCurrencyCode", type: "string", required: false, description: "Updated 3-letter ISO currency code" },
      { name: "billingPeriod", type: "DAY | WEEK | MONTH", required: false, description: "Updated source billing period" },
    ],
    response: `{ "person": { "id": "...", "name": "...", "area": "...", "sourceRate": 700, "sourceCurrencyCode": "USD", "billingPeriod": "WEEK", "archivedAt": null, "createdAt": "...", "updatedAt": "..." } }`,
  },
  {
    method: "DELETE",
    path: "/api/rate-card/people/:id",
    description: "Archive a People & Rates roster entry without removing its history.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Rate-card person CUID" }],
    response: `{ "person": { "id": "...", "archivedAt": "2026-03-31T15:00:00.000Z", ... } }`,
  },
  {
    method: "GET",
    path: "/api/codeclear/stats",
    description: "Get CodeClear dashboard metrics, stage counts, re-check totals, and recent activity.",
    auth: true,
    response: `{ "total": 6, "byStatus": [{ "status": "SOURCED", "count": 1 }, { "status": "CODECLEAR_COMPLETE", "count": 1 }], "avgThis": 90, "avgLast": 82, "passRateThis": 100, "recheckDue": 1, "recentActivity": [{ "id": "...", "eventType": "SCORE_FINALIZED", "createdAt": "..." }] }`,
  },
  {
    method: "GET",
    path: "/api/codeclear/candidates",
    description: "List CodeClear candidates with filters, score ranges, and facets for building the pipeline UI.",
    auth: true,
    params: [
      { name: "q", type: "string", required: false, description: "Search by name, GitHub handle, email, or stack" },
      { name: "status", type: "PipelineStatus", required: false, description: "Filter by sourcing / invited / assessment / verified / placed / re-check due" },
      { name: "tier", type: "CodeClearTier", required: false, description: "Filter by Tier 1 / Tier 2 / Tier 3" },
      { name: "identityConfidence", type: "IdentityConfidence", required: false, description: "Filter by HIGH / MEDIUM / LOW / PENDING" },
      { name: "recheckDue", type: "ANY | SOON | OVERDUE", required: false, description: "Filter candidates with a scheduled re-check" },
      { name: "stack", type: "string", required: false, description: "Filter by primary stack" },
      { name: "sortBy", type: "createdAt | updatedAt | name | status | recheckDueAt | overallScore", required: false, description: "Sort field" },
      { name: "sortDir", type: "asc | desc", required: false, description: "Sort direction" },
    ],
    response: `{ "items": [{ "id": "...", "name": "Sindre Sorhus", "githubHandle": "sindresorhus", "status": "CODECLEAR_COMPLETE", "tier": "TIER_1", "primaryStack": "TypeScript", "analysisState": "COMPLETE", "score": { "overallScore": 90 } }], "meta": { "page": 1, "pageSize": 20, "total": 6, "totalPages": 1, "sortBy": "updatedAt", "sortDir": "desc" }, "facets": { "stacks": ["Node.js", "React", "TypeScript"] } }`,
  },
  {
    method: "POST",
    path: "/api/codeclear/candidates",
    description: "Create a new CodeClear candidate in the shared Gitwork workspace.",
    auth: true,
    body: [
      { name: "name", type: "string", required: true, description: "Candidate display name" },
      { name: "githubHandle", type: "string", required: true, description: "GitHub username without the leading @" },
      { name: "primaryStack", type: "string", required: true, description: "Primary technical discipline or stack" },
      { name: "email", type: "string", required: false, description: "Email address" },
      { name: "location", type: "string", required: false, description: "Location" },
      { name: "bio", type: "string", required: false, description: "Short candidate summary" },
      { name: "tier", type: "CodeClearTier", required: false, description: "Tier assignment" },
      { name: "rateCardPersonId", type: "string", required: false, description: "Optional People & Rates roster link" },
    ],
    response: `{ "candidate": { "id": "...", "name": "New Candidate", "githubHandle": "new-user", "status": "SOURCED", "tier": "TIER_1", "analysisState": "NEVER_RUN" } }`,
  },
  {
    method: "PATCH",
    path: "/api/codeclear/candidates",
    description: "Bulk-update CodeClear candidates by moving stages or flagging a re-check.",
    auth: true,
    body: [
      { name: "action", type: "MOVE_STAGE | FLAG_RECHECK", required: true, description: "Bulk action mode" },
      { name: "ids", type: "string[]", required: true, description: "Candidate IDs to update" },
      { name: "status", type: "PipelineStatus", required: false, description: "Required for MOVE_STAGE" },
      { name: "recheckDueAt", type: "ISO datetime", required: false, description: "Optional re-check due date for FLAG_RECHECK" },
    ],
    response: `{ "candidates": [{ "id": "...", "status": "RECHECK_DUE" }] }`,
  },
  {
    method: "GET",
    path: "/api/codeclear/candidates/:id",
    description: "Get a single CodeClear candidate including notes, placements, activity, scores, and GitHub runs.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Candidate CUID" }],
    response: `{ "candidate": { "id": "...", "name": "...", "score": { "overallScore": 90 }, "scoreDraft": null, "githubAnalysisRuns": [], "placements": [], "notes": [], "activityLog": [] } }`,
  },
  {
    method: "PATCH",
    path: "/api/codeclear/candidates/:id",
    description: "Update the profile, stage, tier, optional re-check date, or People & Rates link for a CodeClear candidate.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Candidate CUID" }],
    body: [
      { name: "name", type: "string", required: false, description: "Updated display name" },
      { name: "githubHandle", type: "string", required: false, description: "Updated GitHub username" },
      { name: "status", type: "PipelineStatus", required: false, description: "Updated pipeline stage" },
      { name: "tier", type: "CodeClearTier", required: false, description: "Updated tier" },
      { name: "recheckDueAt", type: "ISO datetime", required: false, description: "Re-check date" },
    ],
    response: `{ "candidate": { "id": "...", "status": "INVITED", "tier": "TIER_2" } }`,
  },
  {
    method: "DELETE",
    path: "/api/codeclear/candidates/:id",
    description: "Delete a CodeClear candidate and its linked notes, activity, scores, runs, and placements.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Candidate CUID" }],
    response: `{ "ok": true }`,
  },
  {
    method: "POST",
    path: "/api/codeclear/candidates/:id/notes",
    description: "Attach a note to a CodeClear candidate timeline.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Candidate CUID" }],
    body: [{ name: "body", type: "string", required: true, description: "Note content" }],
    response: `{ "note": { "id": "...", "candidateId": "...", "body": "Strong fit for platform work.", "createdBy": "Gitwork Owner", "createdAt": "..." } }`,
  },
  {
    method: "PUT",
    path: "/api/codeclear/candidates/:id/score",
    description: "Finalize a CodeClear score from manual review or the current draft values.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Candidate CUID" }],
    body: [
      { name: "technicalDepth", type: "0-100", required: false, description: "Technical depth score" },
      { name: "codeQuality", type: "0-100", required: false, description: "Code quality score" },
      { name: "aiFluency", type: "0-100", required: false, description: "AI fluency score" },
      { name: "deliveryReadiness", type: "0-100", required: false, description: "Delivery readiness score" },
      { name: "identityConfidence", type: "IdentityConfidence", required: false, description: "Identity confidence" },
      { name: "taskScore", type: "0-100", required: false, description: "Optional task score" },
      { name: "taskTimeSeconds", type: "number", required: false, description: "Optional task duration in seconds" },
      { name: "taskAiReview", type: "string", required: false, description: "Reviewer note" },
    ],
    response: `{ "candidate": { "id": "...", "status": "CODECLEAR_COMPLETE", "score": { "overallScore": 86, "verifiedAt": "...", "validUntil": "..." } } }`,
  },
  {
    method: "GET",
    path: "/api/codeclear/candidates/:id/github-analysis/runs",
    description: "List GitHub analysis runs captured for a CodeClear candidate.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Candidate CUID" }],
    response: `{ "runs": [{ "id": "...", "status": "COMPLETED", "analysisVersion": "docs-codeclear-v1", "startedAt": "...", "completedAt": "...", "metrics": { "averageHealthScore": 84 } }] }`,
  },
  {
    method: "POST",
    path: "/api/codeclear/candidates/:id/github-analysis/runs",
    description: "Run a fresh public GitHub analysis and store the snapshot on the candidate.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Candidate CUID" }],
    response: `{ "run": { "id": "...", "status": "COMPLETED", "recommendedTechnicalDepth": 88, "recommendedCodeQuality": 84, "recommendedDeliveryReadiness": 80, "llmSummary": "..." }, "candidate": { "id": "...", "avatarUrl": "..." } }`,
    notes: "Uses the candidate's `githubHandle` and optionally `GITHUB_TOKEN` for higher GitHub API limits.",
  },
  {
    method: "POST",
    path: "/api/codeclear/candidates/:id/github-analysis/runs/:runId/apply",
    description: "Apply a completed GitHub analysis run to the candidate's score draft.",
    auth: true,
    params: [
      { name: "id", type: "string", required: true, description: "Candidate CUID" },
      { name: "runId", type: "string", required: true, description: "GitHub analysis run CUID" },
    ],
    response: `{ "candidate": { "id": "...", "scoreDraft": { "overallScore": 82, "sourceRunId": "..." } }, "run": { "id": "...", "status": "COMPLETED" } }`,
  },
  {
    method: "GET",
    path: "/api/codeclear/candidates/:id/scorecard",
    description: "Download a generated PDF scorecard for a CodeClear candidate.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Candidate CUID" }],
    response: `Binary PDF response`,
    notes: "Returns `application/pdf` with a generated scorecard filename.",
  },
  {
    method: "GET",
    path: "/api/templates",
    description: "List all proposal templates.",
    auth: true,
    response: `{ "templates": [{ "id": "...", "name": "...", "description": "..." }] }`,
  },
  {
    method: "GET",
    path: "/api/proof/health",
    description: "Proof service status endpoint.",
    auth: false,
    response: `{ "error": "Proof service is disabled in POC mode.", "baseUrl": null }`,
    notes: "Returns 503 until the Proof service is enabled.",
  },
  {
    method: "GET",
    path: "/api/proof/documents",
    description: "Proof document API placeholder.",
    auth: true,
    response: `{ "error": "Proof API is disabled in POC mode. Use the client-side draft workspace instead." }`,
    notes: "Current GET and POST requests return 501 until the Proof service is wired back in.",
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#3b82f6",
  PUT: "#8b5cf6",
  PATCH: "#f59e0b",
  DELETE: "#ef4444",
};

export default function ApiDocsPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
          a { color: #60a5fa; text-decoration: none; }
          a:hover { text-decoration: underline; }
          code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85em; background: #1a1a1a; padding: 2px 6px; border-radius: 4px; color: #d1d5db; }
          pre { background: #111; border: 1px solid #222; border-radius: 8px; padding: 16px; overflow-x: auto; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.83em; color: #a3e635; line-height: 1.5; }
          .container { max-width: 900px; margin: 0 auto; padding: 40px 24px 80px; }
          .header { border-bottom: 1px solid #1f1f1f; padding-bottom: 32px; margin-bottom: 40px; }
          .logo { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #6b7280; margin-bottom: 12px; }
          h1 { font-size: 2rem; font-weight: 700; color: #f9fafb; margin-bottom: 8px; }
          .subtitle { color: #6b7280; font-size: 0.95rem; }
          .base-url-box { background: #111; border: 1px solid #1f1f1f; border-radius: 8px; padding: 16px 20px; margin: 32px 0; display: flex; align-items: center; gap: 12px; }
          .base-url-label { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; white-space: nowrap; }
          .base-url-value { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.88rem; color: #60a5fa; }
          .section-title { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; margin: 40px 0 16px; }
          .auth-box { background: #0f1629; border: 1px solid #1e3a5f; border-radius: 8px; padding: 20px; margin-bottom: 40px; }
          .auth-box h3 { font-size: 0.9rem; font-weight: 600; color: #93c5fd; margin-bottom: 10px; }
          .auth-box p { font-size: 0.88rem; color: #94a3b8; }
          .endpoint { border: 1px solid #1a1a1a; border-radius: 10px; margin-bottom: 16px; overflow: hidden; }
          .endpoint-header { display: flex; align-items: center; gap: 12px; padding: 14px 20px; background: #111; }
          .method-badge { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; padding: 3px 8px; border-radius: 4px; min-width: 60px; text-align: center; }
          .endpoint-path { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.9rem; color: #e2e8f0; flex: 1; }
          .auth-badge { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 2px 8px; border-radius: 10px; }
          .auth-required { background: #1c1917; color: #a8a29e; border: 1px solid #292524; }
          .auth-public { background: #052e16; color: #4ade80; border: 1px solid #14532d; }
          .endpoint-body { padding: 16px 20px; }
          .endpoint-desc { font-size: 0.88rem; color: #94a3b8; margin-bottom: 14px; }
          .param-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 14px; }
          .param-table th { text-align: left; padding: 6px 12px; background: #161616; color: #6b7280; font-weight: 600; letter-spacing: 0.05em; font-size: 0.72rem; text-transform: uppercase; }
          .param-table td { padding: 7px 12px; border-top: 1px solid #1a1a1a; color: #d1d5db; vertical-align: top; }
          .param-table td:first-child { font-family: 'SF Mono', 'Fira Code', monospace; color: #93c5fd; }
          .param-table td:nth-child(2) { color: #a78bfa; font-family: 'SF Mono', 'Fira Code', monospace; }
          .required-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; margin-left: 4px; vertical-align: middle; }
          .sub-label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #4b5563; margin: 12px 0 6px; }
          .note { font-size: 0.8rem; color: #78716c; font-style: italic; margin-top: 10px; }
          .errors-grid { display: grid; grid-template-columns: 80px 1fr; gap: 0; border: 1px solid #1a1a1a; border-radius: 8px; overflow: hidden; font-size: 0.85rem; }
          .errors-grid > div { padding: 10px 16px; border-bottom: 1px solid #1a1a1a; }
          .errors-grid > div:last-child, .errors-grid > div:nth-last-child(2) { border-bottom: none; }
          .error-code { font-family: 'SF Mono', 'Fira Code', monospace; font-weight: 700; }
          .e400 { color: #fbbf24; } .e401 { color: #f87171; } .e404 { color: #fb923c; } .e500 { color: #c084fc; }
          .footer { margin-top: 60px; padding-top: 24px; border-top: 1px solid #1a1a1a; font-size: 0.8rem; color: #374151; text-align: center; }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="header">
            <div className="logo">Docs by Gitwork</div>
            <h1>API Reference</h1>
            <p className="subtitle">REST API for building iOS and web integrations with your proposal workspace.</p>
          </div>

          <div className="base-url-box">
            <span className="base-url-label">Base URL</span>
            <span className="base-url-value">{BASE_URL}</span>
          </div>

          <div className="auth-box">
            <h3>Authentication</h3>
            <p>
              All protected endpoints accept <code>Authorization: Bearer &lt;API_KEY&gt;</code>.
              Internal app pages also use a secure HttpOnly session cookie, so browser requests do
              not need to expose the raw key. Manage <code>API_KEY</code> in your Vercel project
              settings.
            </p>
            <pre style={{ marginTop: 12, color: "#86efac" }}>
              {`Authorization: Bearer your-api-key`}
            </pre>
          </div>

          <div className="section-title">Endpoints</div>

          {endpoints.map((ep, i) => (
            <div key={i} className="endpoint">
              <div className="endpoint-header">
                <span
                  className="method-badge"
                  style={{ background: METHOD_COLORS[ep.method] + "22", color: METHOD_COLORS[ep.method], border: `1px solid ${METHOD_COLORS[ep.method]}44` }}
                >
                  {ep.method}
                </span>
                <span className="endpoint-path">{ep.path}</span>
                <span className={`auth-badge ${ep.auth ? "auth-required" : "auth-public"}`}>
                  {ep.auth ? "Auth required" : "Public"}
                </span>
              </div>
              <div className="endpoint-body">
                <p className="endpoint-desc">{ep.description}</p>

                {ep.params && ep.params.length > 0 && (
                  <>
                    <div className="sub-label">Path Parameters</div>
                    <table className="param-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ep.params.map((p, j) => (
                          <tr key={j}>
                            <td>{p.name}{p.required && <span className="required-dot" title="Required" />}</td>
                            <td>{p.type}</td>
                            <td>{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {ep.body && ep.body.length > 0 && (
                  <>
                    <div className="sub-label">Request Body (JSON)</div>
                    <table className="param-table">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Type</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ep.body.map((p, j) => (
                          <tr key={j}>
                            <td>{p.name}{p.required && <span className="required-dot" title="Required" />}</td>
                            <td>{p.type}</td>
                            <td>{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                <div className="sub-label">Response</div>
                <pre>{ep.response}</pre>
                {ep.notes && <p className="note">{ep.notes}</p>}
              </div>
            </div>
          ))}

          <div className="section-title">Error Codes</div>
          <div className="errors-grid">
            <div><span className="error-code e400">400</span></div>
            <div>Bad Request — invalid or missing fields in request body</div>
            <div><span className="error-code e401">401</span></div>
            <div>Unauthorized — missing or invalid API key</div>
            <div><span className="error-code e404">404</span></div>
            <div>Not Found — the requested resource does not exist</div>
            <div><span className="error-code e500">500</span></div>
            <div>Internal Server Error — unexpected server-side failure</div>
          </div>

          <div className="section-title" style={{ marginTop: 40 }}>Document Statuses</div>
          <pre>{`DRAFT            → Initial state
PRODUCT_SIGN_OFF → Awaiting product approval
TECH_SIGN_OFF    → Awaiting technical approval
IN_REVIEW        → Under client review
APPROVED         → Approved by all parties
SENT             → Delivered to client
ARCHIVED         → Archived / no longer active`}</pre>

          <div className="footer">
            Docs by Gitwork · <a href={BASE_URL}>docs-by-gitwork.vercel.app</a>
          </div>
        </div>
      </body>
    </html>
  );
}
