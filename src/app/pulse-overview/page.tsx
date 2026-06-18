import Link from "next/link";

export default function PulseOverviewPage() {
  return (
    <div className="pulse-overview min-h-screen bg-white" style={{ fontFamily: "var(--font-inter, ui-sans-serif, system-ui, sans-serif)" }}>

      {/* Nav */}
      <header style={{ borderBottom: "1px solid #e5e7eb", background: "white", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Gitwork</span>
            <span style={{ color: "#d1d5db" }}>/</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#4f46e5" }}>Pulse</span>
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>INTERNAL</span>
          </div>
          <Link href="/app/pulse/new" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#4f46e5", color: "white", fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 8, textDecoration: "none" }}>
            Run a scan →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)", color: "white", padding: "80px 24px 72px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 48 }}>
            <div style={{ flex: "1 1 480px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 99, padding: "4px 14px", marginBottom: 24 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#818cf8", display: "inline-block" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#a5b4fc", letterSpacing: "0.08em", textTransform: "uppercase" }}>Pulse by Gitwork</span>
              </div>
              <h1 style={{ fontSize: "clamp(36px, 5vw, 58px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", margin: "0 0 20px" }}>
                We diagnose any<br />
                <span style={{ color: "#818cf8" }}>vibe-coded product</span><br />
                in 60 seconds.
              </h1>
              <p style={{ fontSize: 18, color: "#94a3b8", lineHeight: 1.7, maxWidth: 500, margin: "0 0 36px" }}>
                Before we&apos;ve had a single call with a new client, Pulse tells us exactly what&apos;s broken, what&apos;s missing, and what it will cost to fix. That&apos;s how we walk into every discovery call with the diagnosis already done.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <Link href="/app/pulse/new" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#4f46e5", color: "white", fontWeight: 700, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none" }}>
                  Run a scan now →
                </Link>
                <Link href="/app/pulse" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.08)", color: "white", fontWeight: 600, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", border: "1px solid rgba(255,255,255,0.12)" }}>
                  View scan history
                </Link>
              </div>
            </div>

            {/* Mock scan card */}
            <div style={{ flex: "0 0 320px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 24, backdropFilter: "blur(10px)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <p style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>Health score</p>
                  <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>acme-saas.vercel.app</p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: "#f59e0b" }}>61</div>
                  <div style={{ fontSize: 10, color: "#d97706", fontWeight: 600, marginTop: 2 }}>NEEDS WORK</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                {[["28", "passing", "#16a34a"], ["14", "warnings", "#d97706"], ["9", "failing", "#dc2626"]].map(([n, label, color]) => (
                  <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color }}>{n}</div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {[
                  ["✗", "No error monitoring", "#dc2626"],
                  ["✗", "Missing HSTS header", "#dc2626"],
                  ["✗", "No privacy policy", "#dc2626"],
                  ["⚠", "Stripe but no webhook", "#d97706"],
                  ["⚠", "No meta description", "#d97706"],
                  ["✓", "SSL valid", "#16a34a"],
                ].map(([icon, label, color]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
                    <span style={{ color, fontWeight: 700, width: 14, flexShrink: 0 }}>{icon}</span>
                    <span style={{ color: "#9ca3af" }}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, background: "rgba(79,70,229,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                <p style={{ fontSize: 11, color: "#a5b4fc", fontWeight: 600, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>AI gap analysis</p>
                <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>3 critical gaps · 8 build opportunities · 3-phase roadmap</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live demo — the real embeddable widget */}
      <section style={{ padding: "72px 24px", background: "white", borderBottom: "1px solid #eef2f7" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
            Try it live — free
          </p>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, color: "#0f172a", lineHeight: 1.2, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            Scan any site right now
          </h2>
          <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.7, margin: "0 0 28px" }}>
            The same engine, no AI, no signup — your health score in seconds. This is the exact widget you can drop on your own site.
          </p>
          <iframe
            id="pulse-embed-demo"
            src="/embed/pulse"
            title="Gitwork Pulse — live site health check"
            style={{ width: "100%", maxWidth: 720, margin: "0 auto", border: "1px solid #e2e8f0", borderRadius: 16, minHeight: 540, background: "white", display: "block", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
          />
          {/* Auto-resize the demo iframe to its content height. */}
          <script
            dangerouslySetInnerHTML={{
              __html:
                "(function(){var f=document.getElementById('pulse-embed-demo');window.addEventListener('message',function(e){var d=e.data||{};if(d.type==='pulse-embed-height'&&typeof d.height==='number'&&f){f.style.height=d.height+'px';}});})();",
            }}
          />

          {/* Copy-paste embed snippet for site owners */}
          <div style={{ marginTop: 28, textAlign: "left", background: "#0f172a", borderRadius: 12, padding: "16px 18px", maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" }}>
              Add it to your site
            </p>
            <code style={{ display: "block", fontFamily: "var(--font-mono), monospace", fontSize: 13, color: "#a5b4fc", wordBreak: "break-all" }}>
              &lt;script async src=&quot;https://foundry.gitwork.co.uk/embed/pulse/embed.js&quot;&gt;&lt;/script&gt;
            </code>
          </div>
        </div>
      </section>

      {/* The business case */}
      <section style={{ padding: "80px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 64, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 420px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>The opportunity</p>
              <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, color: "#0f172a", lineHeight: 1.2, letterSpacing: "-0.03em", margin: "0 0 20px" }}>
                Millions of products built with AI. Almost none of them production-ready.
              </h2>
              <p style={{ fontSize: 16, color: "#475569", lineHeight: 1.8, margin: "0 0 16px" }}>
                Every week, developers and founders use Bolt, Lovable, Cursor, and other AI tools to ship products they couldn&apos;t build before. The code runs. The product works. But it&apos;s nowhere near ready to handle real users, real money, or real security requirements.
              </p>
              <p style={{ fontSize: 16, color: "#475569", lineHeight: 1.8, margin: 0 }}>
                That gap — between &quot;it works on my machine&quot; and &quot;production-ready&quot; — is Gitwork&apos;s market. Pulse is the tool that lets us <strong style={{ color: "#0f172a" }}>quantify it, prove it, and sell the fix.</strong>
              </p>
            </div>
            <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                ["Before Pulse", "We walk into discovery calls and spend 45 minutes asking the client what they&apos;ve built. We leave without a clear scope. The proposal takes days.", "#fef2f2", "#dc2626", "#fee2e2"],
                ["After Pulse", "We scan the product before the call. We walk in with a health report, three critical gaps highlighted, and a scoped engagement ready to sign.", "#f0fdf4", "#16a34a", "#dcfce7"],
              ].map(([label, text, bg, color, border]) => (
                <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: 24 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>{label}</p>
                  <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, margin: 0 }} dangerouslySetInnerHTML={{ __html: text }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What it scans */}
      <section style={{ padding: "80px 24px", background: "white" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Works on everything</p>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", margin: "0 0 16px" }}>
              Any product. Any platform. Any codebase.
            </h2>
            <p style={{ fontSize: 16, color: "#64748b", maxWidth: 560, margin: "0 auto" }}>
              Paste a URL, an App Store link, a GitHub repo, or just describe what the client built. Pulse figures out the rest.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {[
              ["🌐", "Web Apps & SaaS", "Any deployed URL"],
              ["📱", "iOS Apps", "App Store URLs"],
              ["🤖", "Android Apps", "Google Play URLs"],
              ["⚛️", "React Native / Flutter", "Cross-platform mobile"],
              ["🐙", "Any GitHub Repo", "Full code quality scan"],
              ["🖥️", "Desktop Apps", "Electron, Tauri, etc."],
              ["🧩", "Chrome Extensions", "Browser extensions"],
              ["⚡", "APIs & Backends", "Serverless, Node, Python"],
              ["📝", "Described Projects", "APK / IPA / no public URL"],
            ].map(([icon, title, sub]) => (
              <div key={title} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px 18px", transition: "all 0.15s" }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What the output looks like */}
      <section style={{ padding: "80px 24px", background: "#0f172a", color: "white" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>The output</p>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 16px" }}>
              Everything you need for the discovery call
            </h2>
            <p style={{ fontSize: 16, color: "#94a3b8", maxWidth: 560, margin: "0 auto" }}>
              A full report — automated checks plus AI analysis — ready before you pick up the phone.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {[
              {
                icon: "📊",
                title: "Health score (0–100)",
                desc: "A single number that anchors the conversation. We can benchmark it against previous scans and track improvement over an engagement.",
                color: "#4f46e5",
              },
              {
                icon: "✗",
                title: "Critical gaps",
                desc: "Specific things that are broken, missing, or dangerous — with urgency ratings (CRITICAL / HIGH / MEDIUM) and business impact for each.",
                color: "#dc2626",
              },
              {
                icon: "🔨",
                title: "Build opportunities",
                desc: "Every gap is a billable opportunity. Each one comes with an effort estimate (S / M / L / XL) and business value rating — ready to scope.",
                color: "#d97706",
              },
              {
                icon: "🗺️",
                title: "Scaling roadmap",
                desc: "A phased plan — Stabilise, Productionise, Scale — with goals and timelines. Becomes the structure of the proposal.",
                color: "#16a34a",
              },
              {
                icon: "☑️",
                title: "Production readiness checklist",
                desc: "12–20 items covering legal, auth, payments, onboarding, trust, and observability. DONE / PARTIAL / MISSING status for each.",
                color: "#0891b2",
              },
              {
                icon: "📄",
                title: "Downloadable PDF report",
                desc: "One click. A clean, professional PDF of the full scan. Print it, share it, or use it to open the call.",
                color: "#7c3aed",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 28 }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 10px" }}>{title}</h3>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 450+ checks */}
      <section style={{ padding: "80px 24px", background: "white" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 56, alignItems: "center" }}>
            <div style={{ flex: "1 1 340px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Automated checks</p>
              <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", margin: "0 0 16px" }}>
                500+ checks.<br />23 categories.<br />Built for AI products.
              </h2>
              <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.8, margin: "0 0 24px" }}>
                Pulse doesn&apos;t run generic checks. It detects the project type first — AI app, SaaS, mobile app, marketing site, API — then runs only the checks that matter. Purpose-built for 2026: it knows what an LLM product needs in production, and what AI code generators leave behind.
              </p>
              <div style={{ display: "flex", gap: 16 }}>
                {[["500+", "automated checks"], ["23", "check categories"], ["&lt;30s", "scan time"]].map(([n, label]) => (
                  <div key={label}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#4f46e5" }} dangerouslySetInnerHTML={{ __html: n }} />
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: "1 1 420px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["AI Readiness", "13", "Cost monitoring, content safety, rate limits, streaming, EU AI Act, evals"],
                ["Vibe Code Hygiene", "10", "Placeholder content, debug mode, default titles, AI markers, test creds"],
                ["Secrets & Keys", "3", "Exposed API keys, committed .env, prompt-injection vectors"],
                ["Security", "30", "CSP, HSTS, DNSSEC, CAA, exposed endpoints, secret scanning"],
                ["Legal & Compliance", "45", "GDPR, CCPA, LGPD, AI Act, DPA, cookie consent"],
                ["Performance", "23", "Core Web Vitals, WebP/AVIF, HTTP/3, lazy loading, critical CSS"],
                ["Authentication", "15", "MFA, passkeys, breach detection, SSO, token hygiene"],
                ["Accessibility (WCAG)", "20", "Labels, contrast, ARIA, captions, reduced-motion"],
                ["API Quality", "15", "Versioning, RFC 7807, rate limits, OpenAPI, sandbox"],
                ["Code Intelligence", "10", "Vulnerabilities, branch protection, PR reviews, commit velocity"],
              ].map(([cat, count, desc]) => (
                <div key={cat} style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: "#4f46e5" }}>{count}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>checks</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{cat}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI providers */}
      <section style={{ padding: "72px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 48, alignItems: "center" }}>
            <div style={{ flex: "1 1 320px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>AI analysis</p>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", margin: "0 0 14px" }}>
                Your model. Your data. Your choice.
              </h2>
              <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.8, margin: "0 0 14px" }}>
                Switch AI providers in Settings. No code changes needed.
              </p>
              <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
                If no key is configured, Pulse still runs all 500+ automated checks and returns a structured mock analysis — so the whole workflow can be tested without spending API credits.
              </p>
            </div>
            <div style={{ flex: "1 1 480px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { name: "Claude", model: "claude-opus-4-6", note: "Default. Best for structured gap analysis.", bg: "#fff7ed", border: "#fed7aa", badge: "#ea580c" },
                { name: "GPT-4o (OpenAI)", model: "gpt-4o", note: "Any OpenAI model. Model name is configurable.", bg: "#f0fdf4", border: "#bbf7d0", badge: "#16a34a" },
                { name: "Gemini (Google)", model: "gemini-2.0-flash", note: "Via OpenAI-compatible endpoint. No extra SDK needed.", bg: "#eff6ff", border: "#bfdbfe", badge: "#2563eb" },
                { name: "Local LLM", model: "Ollama / LM Studio", note: "Point at any OpenAI-compatible server. Zero API cost.", bg: "#f8fafc", border: "#e2e8f0", badge: "#475569" },
              ].map(({ name, model, note, bg, border, badge }) => (
                <div key={name} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>{name}</p>
                    <span style={{ fontSize: 10, fontWeight: 700, color: badge, background: "rgba(0,0,0,0.06)", padding: "2px 7px", borderRadius: 99 }}>✓ READY</span>
                  </div>
                  <p style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280", margin: "0 0 6px" }}>{model}</p>
                  <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, margin: 0 }}>{note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How to use it */}
      <section style={{ padding: "80px 24px", background: "white" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>How to use it</p>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", margin: "0 0 56px" }}>
            Three steps to a closed engagement
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              {
                n: "01",
                title: "Before the call",
                detail: "Paste the client's URL, GitHub repo, or App Store link into Pulse. The scan runs in 30 seconds. You now have a health score, critical gaps, and a scoped set of build opportunities before you've spoken to them.",
              },
              {
                n: "02",
                title: "On the call",
                detail: "Open with the health score. \"We scanned your product and it's sitting at 58/100 — here's what that means.\" Walk them through the top gaps. The client didn't know half of these existed. You've already demonstrated more value than any other vendor they'll talk to.",
              },
              {
                n: "03",
                title: "After the call",
                detail: "Download the PDF report. Send it to the client as your follow-up. The report becomes the basis of the proposal — scope, phases, and priorities are already defined by the scan.",
              },
            ].map(({ n, title, detail }, i) => (
              <div key={n} style={{ display: "flex", gap: 24, textAlign: "left", position: "relative" }}>
                {i < 2 && <div style={{ position: "absolute", left: 23, top: 56, bottom: -32, width: 2, background: "#e2e8f0" }} />}
                <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: "50%", background: "#4f46e5", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, zIndex: 1 }}>{n}</div>
                <div style={{ paddingBottom: 48 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "10px 0 10px" }}>{title}</h3>
                  <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.8, margin: 0 }}>{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "80px 24px", background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 900, color: "white", letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px" }}>
            Try it now.
          </h2>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", margin: "0 0 40px" }}>
            Paste any URL and get a full health report in under 60 seconds. No API key needed to test.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
            <Link href="/app/pulse/new" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "white", color: "#4f46e5", fontWeight: 800, fontSize: 16, padding: "16px 36px", borderRadius: 14, textDecoration: "none" }}>
              Run a scan →
            </Link>
            <Link href="/app/settings" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.7)", fontWeight: 600, fontSize: 14, padding: "16px 24px", textDecoration: "none" }}>
              Settings → Integrations
            </Link>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid #e5e7eb", padding: "28px 24px", background: "white" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>© {new Date().getFullYear()} Gitwork · Internal use only</span>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>Pulse v1 · from prompt to production</span>
        </div>
      </footer>
    </div>
  );
}
