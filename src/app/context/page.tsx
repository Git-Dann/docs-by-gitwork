/**
 * AI Context Page — /context
 *
 * This page is not linked in the nav. It exists so an AI assistant
 * (e.g. Claude Code) can fetch structured project context after a session
 * disconnect and resume work without losing state.
 *
 * Keep this page up to date as the codebase evolves.
 */

export const metadata = {
  title: "Project Context — Foundry by Gitwork",
  robots: "noindex",
};

export default function ContextPage() {
  return (
    <div style={{ fontFamily: "monospace", maxWidth: 860, margin: "0 auto", padding: "48px 24px", color: "#1a1a18", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Foundry by Gitwork — AI Context</h1>
      <p style={{ color: "#666", marginBottom: 40 }}>Last updated: May 2026 · Not linked in nav · noindex</p>

      {/* ── WHAT IT IS ───────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: "1px solid #e5e5e5", paddingBottom: 6, marginBottom: 16 }}>What It Is</h2>
        <p>
          Foundry by Gitwork is a design-and-build agency platform. It combines an internal SaaS tool
          for the Gitwork team with a public marketing page. The production URL is{" "}
          <code>foundry.gitwork.co.uk</code>. The GitHub repo is{" "}
          <code>Git-Dann/docs-by-gitwork</code> (main branch = production).
        </p>
      </section>

      {/* ── MODULE MAP ───────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: "1px solid #e5e5e5", paddingBottom: 6, marginBottom: 16 }}>Module Map</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ textAlign: "left", padding: "6px 10px", border: "1px solid #e5e5e5" }}>Module</th>
              <th style={{ textAlign: "left", padding: "6px 10px", border: "1px solid #e5e5e5" }}>Route</th>
              <th style={{ textAlign: "left", padding: "6px 10px", border: "1px solid #e5e5e5" }}>Description</th>
              <th style={{ textAlign: "left", padding: "6px 10px", border: "1px solid #e5e5e5" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Marketing", "/", "Foundry public homepage (Gitwork logo, Foundry design)", "Live"],
              ["Docs / Proposals", "/app/proposals", "Proposal builder — sections, costing, timeline, PDF export", "Live"],
              ["Proof", "/app/proof", "Document sign-off workflow — DRAFT → APPROVED", "Live"],
              ["Code", "/app/codeclear", "Developer hiring pipeline with GitHub analysis + scoring", "Live"],
              ["Clients", "/app/clients", "Client management and profile pages", "Live"],
              ["Pulse", "/app/pulse", "AI project validation — 150+ automated checks, gap analysis, fix agent", "Live"],
              ["Study", "/app/study", "AI-powered user research — multi-agent interview pipeline", "Live"],
              ["Care / Support", "/app/support", "Client support ops — conversations, tickets, workflow rules", "Live"],
              ["Pulse Overview", "/pulse-overview", "Public-facing standalone Pulse product page (not in app nav)", "Live"],
              ["Rate Card", "(settings)", "People rates used in proposal costing", "Live"],
              ["API Docs", "/api-docs", "REST API reference page", "Live"],
            ].map(([mod, route, desc, status]) => (
              <tr key={route}>
                <td style={{ padding: "6px 10px", border: "1px solid #e5e5e5", fontWeight: 500 }}>{mod}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #e5e5e5" }}><code>{route}</code></td>
                <td style={{ padding: "6px 10px", border: "1px solid #e5e5e5", color: "#444" }}>{desc}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #e5e5e5", color: "#22863a" }}>{status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── TECH STACK ───────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: "1px solid #e5e5e5", paddingBottom: 6, marginBottom: 16 }}>Tech Stack</h2>
        <ul style={{ paddingLeft: 20, fontSize: 14 }}>
          <li><strong>Framework:</strong> Next.js 15 (App Router, React 19) · TypeScript</li>
          <li><strong>Styling:</strong> Tailwind CSS v4 (CSS-first config, <code>@layer base/components/utilities</code>)</li>
          <li><strong>Database:</strong> Neon PostgreSQL via Prisma ORM (pooled + direct URL)</li>
          <li><strong>AI:</strong> Anthropic SDK (<code>@anthropic-ai/sdk</code>) + OpenAI-compatible SDK for multi-provider routing</li>
          <li><strong>Data fetching:</strong> TanStack React Query v5 + custom hooks in <code>src/hooks/</code></li>
          <li><strong>Auth:</strong> Cookie-based session middleware (API_KEY env var) — full employee auth is upcoming</li>
          <li><strong>Deploy:</strong> Vercel (team: <code>dans-projects-7462374f</code>, project: <code>foundry-by-gitwork</code>)</li>
          <li><strong>Drag &amp; drop:</strong> @dnd-kit</li>
          <li><strong>PDF:</strong> pdf-lib</li>
          <li><strong>Validation:</strong> Zod (schemas in <code>src/server/validators.ts</code>)</li>
        </ul>
      </section>

      {/* ── FILE STRUCTURE ───────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: "1px solid #e5e5e5", paddingBottom: 6, marginBottom: 16 }}>Key File Locations</h2>
        <pre style={{ background: "#f9f9f9", border: "1px solid #e5e5e5", borderRadius: 6, padding: 16, fontSize: 13, overflowX: "auto" }}>{`src/
  app/
    page.tsx                    ← Marketing homepage (Foundry design)
    (app)/app/                  ← All platform app routes (wrapped in AppShell)
    api/                        ← REST API routes (all auth-gated via middleware)
    api/dev/                    ← Dev-only seed routes (seed-demo, seed-study-demo)
    pulse-overview/             ← Standalone public Pulse product page
    context/page.tsx            ← This page (AI context, not in nav)
  server/
    bootstrap.ts                ← Ensures base Prisma records exist
    validators.ts               ← Zod schemas for all API inputs
    pulse.ts                    ← Pulse CRUD + scan management
    pulse-scan.ts               ← Core scan engine (150+ checks, 3200+ lines)
    pulse-ai.ts                 ← AI model routing (Anthropic/OpenAI/Gemini/Local)
    pulse-agents/
      browser-agent.ts          ← Headless browser checks
      code-agent.ts             ← GitHub repo analysis
      deploy-agent.ts           ← Deployment/infra checks
      orchestrator.ts           ← Scan orchestration
      fix-agent.ts              ← Auto-fix PR generation
      monitor.ts                ← GitHub webhook monitors
    study.ts                    ← Study CRUD + AI research pipeline
    study-agents/
      researcher.ts             ← Research plan + follow-up questions
      persona.ts                ← AI persona interview conductor
      synthesizer.ts            ← Session/report synthesis
      types.ts                  ← Shared study agent types
    codeclear.ts                ← Code (developer validation) management
    codeclear-analysis.ts       ← GitHub code analysis
    proposals.ts                ← Proposal CRUD + default payloads
    support.ts                  ← Care/Support CRUD (clients, tickets, conversations)
    clients.ts                  ← Client CRUD
    proof.ts                    ← Proof document workflow
    rate-card.ts                ← Rate card people CRUD
  components/
    app-shell.tsx               ← Sidebar + layout shell (uses foundry-logo.png)
    pulse/                      ← Pulse UI components
    study/                      ← Study UI components
    support/                    ← Care/Support UI
    proposals/                  ← Proposal builder components
    marketing/codeclear-site-demo.tsx ← Public Code demo widget
  hooks/                        ← React Query hooks (use-pulse, use-study, etc.)
  lib/
    prisma.ts                   ← Prisma client singleton
    api.ts                      ← Fetch helpers for all API routes
    local-settings.ts           ← localStorage settings (account, workspace, branding)
    format.ts                   ← cn() and other formatters
    github.ts                   ← GitHub API helpers
  types/                        ← TypeScript types (pulse, support, codeclear, etc.)
  middleware.ts                 ← CORS + API_KEY auth + session cookie
  config/
    study-personas.ts           ← 8 built-in research personas`}</pre>
      </section>

      {/* ── CONVENTIONS ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: "1px solid #e5e5e5", paddingBottom: 6, marginBottom: 16 }}>Conventions</h2>
        <ul style={{ paddingLeft: 20, fontSize: 14 }}>
          <li><strong>API pattern:</strong> All routes use <code>apiOk()</code> / <code>apiError()</code> / <code>fromError()</code> from <code>src/lib/api-response.ts</code></li>
          <li><strong>Server modules:</strong> One file per domain (<code>pulse.ts</code>, <code>study.ts</code>, etc.). Agents live in <code>pulse-agents/</code> or <code>study-agents/</code> subfolders.</li>
          <li><strong>Auth:</strong> NextAuth.js v5 with Google OAuth (restricted to @gitwork.co.uk). ADMIN/STAFF roles on <code>WorkspaceMember</code>; module-level permissions in JSON.</li>
          <li><strong>CSS:</strong> Tailwind v4. Global anchor reset is in <code>@layer base</code> to avoid overriding utility text-color classes.</li>
          <li><strong>Images:</strong> Use <code>next/image</code> for static assets. Raw <code>&lt;img&gt;</code> is only acceptable for dynamic user avatars (suppressed with <code>eslint-disable</code>).</li>
          <li><strong>Settings persistence:</strong> Workspace defaults (<code>preparedBy</code>, branding, snippets, confidentiality) live on the <code>Workspace</code> row. Per-user profile (<code>name</code>, <code>avatarUrl</code>) lives on the <code>User</code> row. Read via <code>useAccount()</code>, <code>useWorkspaceBranding()</code>, <code>useWorkspaceDefaults()</code>.</li>
          <li><strong>AI providers:</strong> Always resolve from workspace settings via <code>pulse-ai.ts getModelForTask()</code> — never hardcode a model name.</li>
        </ul>
      </section>

      {/* ── ACTIVE WORK ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: "1px solid #e5e5e5", paddingBottom: 6, marginBottom: 16 }}>Active Work &amp; Known Issues</h2>
        <ul style={{ paddingLeft: 20, fontSize: 14 }}>
          <li>Marketing homepage uses <code>/gitwork-logo-home-page.png</code> in nav + footer (uploaded to <code>public/</code>)</li>
          <li>App sidebar uses <code>/foundry-logo.png</code> (uploaded to <code>public/</code>)</li>
          <li>Tailwind v4 cascade layer fix applied — anchor reset wrapped in <code>@layer base</code> in <code>globals.css</code></li>
          <li><code>pulse-scan.ts</code> is 3200+ lines — refactor/split is a future task</li>
          <li>TypeScript <code>any</code> usage (~135 instances) — gradual cleanup is a future task</li>
        </ul>
      </section>

      {/* ── UPCOMING ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, borderBottom: "1px solid #e5e5e5", paddingBottom: 6, marginBottom: 16 }}>Upcoming (Next Sessions)</h2>
        <ul style={{ paddingLeft: 20, fontSize: 14 }}>
          <li><strong>Auth — Gitwork employees:</strong> Login with Admin + Staff roles. Middleware guards on <code>/app/**</code>. User model already in Prisma schema.</li>
          <li><strong>Care vector store:</strong> pgvector via Neon extension for semantic search over Care conversations and client context.</li>
        </ul>
      </section>

      <p style={{ fontSize: 12, color: "#999", borderTop: "1px solid #e5e5e5", paddingTop: 16 }}>
        This page is maintained manually. Update it when modules are added, renamed, or removed.
        See <code>CLAUDE.md</code> at the repo root for a quick pointer here.
      </p>
    </div>
  );
}
