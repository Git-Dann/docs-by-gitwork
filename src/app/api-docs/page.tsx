export const metadata = {
  title: "API Reference — Docs by GitWork",
  description: "REST API documentation for Docs by GitWork",
};

const BASE_URL = "https://docs-by-gitwork.vercel.app";

interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
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
    method: "POST",
    path: "/api/proposals",
    description: "Create a new proposal.",
    auth: true,
    body: [
      { name: "title", type: "string", required: true, description: "Proposal title" },
      { name: "clientId", type: "string", required: false, description: "ID of an existing client" },
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
    response: `{ "ok": true }`,
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
    method: "PATCH",
    path: "/api/proposals/:id/engagement",
    description: "Update the engagement section (scope, deliverables, objectives).",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    body: [
      { name: "scope", type: "string", required: false, description: "Project scope description" },
      { name: "deliverables", type: "string[]", required: false, description: "List of deliverable strings" },
      { name: "objectives", type: "string[]", required: false, description: "List of objective strings" },
    ],
    response: `{ "engagement": { "id": "...", "scope": "...", "deliverables": [...], "objectives": [...] } }`,
  },
  {
    method: "PATCH",
    path: "/api/proposals/:id/timeline",
    description: "Replace the timeline phases for a proposal.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    body: [
      { name: "phases", type: "Phase[]", required: true, description: "Array of { name, duration, description } objects" },
    ],
    response: `{ "phases": [{ "id": "...", "name": "...", "duration": "...", "description": "...", "order": 0 }] }`,
  },
  {
    method: "PATCH",
    path: "/api/proposals/:id/costing",
    description: "Update costing line items for a proposal.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    body: [
      { name: "items", type: "CostItem[]", required: true, description: "Array of { label, quantity, unitPrice } objects" },
    ],
    response: `{ "costing": { "id": "...", "items": [...], "total": 0 } }`,
  },
  {
    method: "GET",
    path: "/api/proposals/:id/export",
    description: "Export a proposal as PDF (returns binary PDF data).",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Proposal CUID" }],
    response: `Content-Type: application/pdf — binary PDF stream`,
    notes: "Set Accept: application/pdf. Response is raw PDF bytes, not JSON.",
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
    description: "Health check for proof-of-concept endpoints.",
    auth: false,
    response: `{ "ok": true }`,
  },
  {
    method: "GET",
    path: "/api/proof/documents",
    description: "List proof documents.",
    auth: true,
    response: `{ "documents": [{ "id": "...", "title": "...", "status": "...", "updatedAt": "..." }] }`,
  },
  {
    method: "GET",
    path: "/api/proof/documents/:id",
    description: "Get a single proof document.",
    auth: true,
    params: [{ name: "id", type: "string", required: true, description: "Document CUID" }],
    response: `{ "document": { "id": "...", "title": "...", "content": "...", ... } }`,
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#3b82f6",
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
            <div className="logo">Docs by GitWork</div>
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
              All protected endpoints require an <code>Authorization</code> header with your API key.
              Retrieve your key from <strong>Settings → API</strong> inside the app.
            </p>
            <pre style={{ marginTop: 12, color: "#86efac" }}>
              {`Authorization: Bearer haTLXszFJ5GMYEvMNbzNeRqQQyxzSHEPRrBHowXlaqM=`}
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
            Docs by GitWork · <a href={BASE_URL}>docs-by-gitwork.vercel.app</a>
          </div>
        </div>
      </body>
    </html>
  );
}
