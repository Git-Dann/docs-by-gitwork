import Link from "next/link";

const checkCategories = [
  { name: "Infrastructure", count: 8 },
  { name: "SEO & Discoverability", count: 7 },
  { name: "Security", count: 5 },
  { name: "Performance", count: 3 },
  { name: "Authentication", count: 6 },
  { name: "Payments & Monetisation", count: 5 },
  { name: "Observability", count: 7 },
  { name: "Code Quality", count: 9 },
  { name: "App Store & Mobile", count: 11 },
  { name: "SaaS Readiness", count: 6 },
];

const aiProviders = [
  {
    name: "Claude",
    vendor: "Anthropic",
    description: "Sonnet & Opus for deep reasoning and structured gap analysis.",
    color: "from-orange-50 to-amber-50",
    border: "border-orange-200",
    badge: "bg-orange-100 text-orange-700",
    icon: "✦",
  },
  {
    name: "GPT-4o",
    vendor: "OpenAI",
    description: "Multimodal analysis across screenshots, code, and app metadata.",
    color: "from-emerald-50 to-teal-50",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
    icon: "◎",
  },
  {
    name: "Gemini",
    vendor: "Google",
    description: "Long-context scanning for large codebases and extensive reports.",
    color: "from-blue-50 to-sky-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    icon: "◈",
  },
  {
    name: "Local LLM",
    vendor: "Ollama",
    description: "Keep sensitive client data fully on-premise with zero API costs.",
    color: "from-slate-50 to-zinc-50",
    border: "border-slate-200",
    badge: "bg-slate-100 text-slate-700",
    icon: "⬡",
  },
];

const problems = [
  "No error monitoring or alerting",
  "Missing SSL / insecure endpoints",
  "Exposed secrets in the codebase",
  "No authentication flows",
  "No privacy policy or cookie consent",
  "No analytics or user tracking",
];

export default function PulseOverviewPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── Nav ───────────────────────────────────────────────────── */}
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Gitwork</span>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-indigo-600">Pulse</span>
          </div>
          <Link
            href="/app/pulse/new"
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Run a scan →
          </Link>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-950 to-indigo-950 text-white">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-28 lg:pb-32">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-16">
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="inline-flex items-center gap-2 text-indigo-400 text-sm font-medium tracking-widest uppercase mb-4">
                <span className="inline-block w-5 h-px bg-indigo-400" />
                Pulse by Gitwork
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
                AI-Powered<br />
                <span className="text-indigo-400">Project Health</span><br />
                Scanner
              </h1>
              <p className="text-lg sm:text-xl text-slate-300 leading-relaxed mb-10 max-w-xl">
                Know exactly what it takes to take any vibe-coded product from prompt to
                production — in under 60&nbsp;seconds.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/app/pulse/new"
                  className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-900/30"
                >
                  Run a scan →
                </Link>
                <Link
                  href="/app/pulse"
                  className="inline-flex items-center gap-2 bg-white/10 text-white font-medium px-6 py-3 rounded-xl hover:bg-white/15 transition-colors border border-white/10"
                >
                  View example scan
                </Link>
              </div>
            </div>

            {/* Health score decorative element */}
            <div className="mt-14 lg:mt-0 flex-shrink-0 flex items-center justify-center">
              <div className="relative">
                {/* Outer glow ring */}
                <div className="absolute inset-0 rounded-full bg-green-500/20 blur-2xl scale-125" />
                <div className="relative w-52 h-52 rounded-full border-[6px] border-green-400/30 bg-slate-900/60 backdrop-blur flex flex-col items-center justify-center shadow-2xl">
                  {/* Circular progress arc using SVG */}
                  <svg
                    className="absolute inset-0 w-full h-full -rotate-90"
                    viewBox="0 0 200 200"
                  >
                    <circle
                      cx="100"
                      cy="100"
                      r="88"
                      fill="none"
                      stroke="rgba(74,222,128,0.15)"
                      strokeWidth="10"
                    />
                    <circle
                      cx="100"
                      cy="100"
                      r="88"
                      fill="none"
                      stroke="#4ade80"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 88 * 0.74} ${2 * Math.PI * 88}`}
                    />
                  </svg>
                  <span className="text-7xl font-black text-green-400 leading-none">74</span>
                  <span className="text-slate-400 text-xs font-medium mt-1 tracking-wider uppercase">
                    Health score
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Problem ───────────────────────────────────────────── */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            {/* Left */}
            <div>
              <p className="text-indigo-600 text-sm font-semibold uppercase tracking-widest mb-4">
                The Problem
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-6">
                Clients are shipping AI&#8209;generated code to production without knowing
                what&rsquo;s missing.
              </h2>
              <p className="text-slate-500 text-lg leading-relaxed">
                Vibe-coded MVPs move fast — but the gaps they leave behind are real.
                Before a client hands over payment, Pulse gives you a definitive
                picture of what&rsquo;s broken and what needs building next.
              </p>
            </div>

            {/* Right */}
            <div>
              <p className="text-slate-700 font-semibold mb-5 text-sm uppercase tracking-wide">
                Common issues we find
              </p>
              <ul className="space-y-3">
                {problems.map((problem) => (
                  <li key={problem} className="flex items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-red-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    <span className="text-slate-700">{problem}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── What Pulse Does ───────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-indigo-600 text-sm font-semibold uppercase tracking-widest mb-3">
              What Pulse does
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              Three steps from scan to proposal
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="group relative rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg hover:border-indigo-200 transition-all">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-5">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-3">Automated health scan</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                150+ checks across infrastructure, security, SEO, auth, payments,
                observability, and mobile — run automatically in seconds.
              </p>
            </div>

            {/* Card 2 */}
            <div className="group relative rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg hover:border-indigo-200 transition-all">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center mb-5">
                <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-3">AI gap analysis</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Critical gaps, build opportunities, scaling roadmap, and a production
                readiness checklist — powered by Claude, GPT-4o, Gemini, or a local LLM.
              </p>
            </div>

            {/* Card 3 */}
            <div className="group relative rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg hover:border-indigo-200 transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-5">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-3">Instant report</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Downloadable PDF report ready to present in a discovery call.
                One-click proposal generation included.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────── */}
      <section className="py-20 bg-indigo-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              From URL to report in three steps
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden sm:block absolute top-8 left-[calc(33.33%+1rem)] right-[calc(33.33%+1rem)] h-px bg-indigo-800" />

            {[
              {
                step: "01",
                title: "Submit any project",
                description:
                  "Paste a URL, App Store link, Play Store link, GitHub repo, or describe the app in plain English.",
              },
              {
                step: "02",
                title: "Pulse runs",
                description:
                  "Automated checks complete in 15–30 seconds; AI analysis generates the full gap report.",
              },
              {
                step: "03",
                title: "Download the report",
                description:
                  "PDF ready for the discovery call. One-click generate proposal to close the engagement.",
              },
            ].map(({ step, title, description }) => (
              <div key={step} className="relative flex flex-col items-start sm:items-center sm:text-center">
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center mb-5 z-10">
                  <span className="text-2xl font-black text-indigo-300">{step}</span>
                </div>
                <h3 className="text-lg font-bold mb-2">{title}</h3>
                <p className="text-indigo-200 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What We Check ─────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-indigo-600 text-sm font-semibold uppercase tracking-widest mb-3">
              What we check
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              150+ checks across 10 categories
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              Every scan covers the full surface area of a production-ready product —
              nothing falls through the cracks.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {checkCategories.map(({ name, count }) => (
              <div
                key={name}
                className="rounded-xl border border-slate-200 bg-slate-50 p-5 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
              >
                <div className="text-3xl font-black text-indigo-600 group-hover:text-indigo-700 mb-1 leading-none">
                  {count}
                </div>
                <div className="text-[11px] text-slate-400 mb-2 font-medium">checks</div>
                <div className="text-sm font-semibold text-slate-700 leading-snug">{name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Multi-provider AI ─────────────────────────────────────── */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-indigo-600 text-sm font-semibold uppercase tracking-widest mb-3">
              Multi-provider AI
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Works with your AI of choice
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              Configure your API key in{" "}
              <Link href="/app/settings" className="text-indigo-600 hover:underline font-medium">
                Settings → Integrations
              </Link>{" "}
              and Pulse will use whichever model fits your workflow.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {aiProviders.map(({ name, vendor, description, color, border, badge, icon }) => (
              <div
                key={name}
                className={`rounded-2xl border ${border} bg-gradient-to-br ${color} p-6`}
              >
                <div className="text-2xl mb-3">{icon}</div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{name}</h3>
                    <p className="text-slate-500 text-xs">{vendor}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge}`}>
                    Supported
                  </span>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Footer ────────────────────────────────────────────── */}
      <section className="py-24 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-black mb-4 leading-tight">
            Ready to run your first scan?
          </h2>
          <p className="text-indigo-200 text-lg mb-10">
            Paste any URL and get a full health report in under 60 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/app/pulse/new"
              className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold text-lg px-8 py-4 rounded-2xl hover:bg-indigo-50 transition-colors shadow-xl shadow-indigo-900/20"
            >
              Start scanning →
            </Link>
            <Link
              href="/app/settings"
              className="text-indigo-200 hover:text-white text-sm font-medium transition-colors"
            >
              Or configure your API key first
            </Link>
          </div>
        </div>
      </section>

      {/* ── Page footer ───────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-8 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-400 text-sm">
            &copy; {new Date().getFullYear()} Gitwork. All rights reserved.
          </p>
          <p className="text-slate-400 text-sm">
            Pulse · Internal tool — not for distribution
          </p>
        </div>
      </footer>
    </div>
  );
}
