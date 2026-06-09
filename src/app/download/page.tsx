import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Download Foundry for Mac — Gitwork",
  description:
    "The native macOS app for Foundry. Install once from the DMG; future updates arrive automatically inside the app.",
};

type LatestMac = {
  version: string;
  build: string;
  arch: string;
  minimumMacOS: string;
  dmgUrl: string;
  sha256: string;
  releaseDate: string;
  notarized: boolean;
  sparkleAppcastUrl: string;
  notes: string[];
};

// Read at request time so a release can update public/desktop/latest-mac.json without code changes.
async function loadLatest(): Promise<LatestMac | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "desktop", "latest-mac.json"), "utf8");
    return JSON.parse(raw) as LatestMac;
  } catch {
    return null;
  }
}

const installSteps = [
  { n: "01", text: "Download the DMG and open it." },
  { n: "02", text: "Drag Foundry into your Applications folder." },
  { n: "03", text: "Launch Foundry and sign in with your Gitwork Google account." },
];

const mono = "var(--font-mono)";

export default async function DownloadPage() {
  const meta = await loadLatest();
  const hasBuild = Boolean(meta?.dmgUrl);
  const dash = (v?: string) => (v && v.length > 0 ? v : "—");
  const minMac = meta?.minimumMacOS ?? "26.0";
  const arch = meta?.arch ? meta.arch.replace(/^\w/, (c) => c.toUpperCase()) : "Universal";
  const releaseDate = meta?.releaseDate
    ? new Date(meta.releaseDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  return (
    <div className="min-h-screen" style={{ background: "var(--surface-canvas)", color: "var(--text-1)" }}>
      <div className="signal-stripe-thin" aria-hidden="true" />

      {/* Header */}
      <header className="border-b" style={{ borderColor: "var(--border-2)" }}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5 sm:px-8">
          <Link href="/" aria-label="Gitwork home" className="inline-flex items-center">
            <Image src="/foundry-logo.svg" alt="Foundry" width={132} height={28} className="h-7 w-auto" priority />
          </Link>
          <a
            href="https://foundry.gitwork.co.uk"
            className="text-[12px] uppercase tracking-[0.08em]"
            style={{ fontFamily: mono, color: "var(--text-4)" }}
          >
            foundry.gitwork.co.uk ↗
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1180px] px-6 pt-16 pb-12 sm:px-8 sm:pt-20">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ fontFamily: mono, color: "var(--brand-700)" }}>
          {"// Foundry for Mac"}
        </p>
        <h1 className="mt-4 max-w-[15ch] text-[44px] leading-[1.08] tracking-[-0.02em] sm:text-[52px]" style={{ color: "var(--text-1)" }}>
          Install Foundry for Mac
        </h1>
        <p className="mt-5 max-w-[54ch] text-[16px] leading-7" style={{ color: "var(--text-3)" }}>
          Write and track proposals, manage clients, run CodeClear hiring and keep your rate
          card — your whole Foundry workspace, native on the Mac. Install once; every update
          installs itself inside the app.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-4">
          {hasBuild ? (
            <a href={meta!.dmgUrl} download className="app-button app-button-primary app-button-lg">
              Download for Mac
              {meta?.version ? <span className="ml-2 opacity-75">v{meta.version}</span> : null}
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="app-button app-button-dark app-button-lg"
              style={{ opacity: 0.55, cursor: "not-allowed" }}
            >
              Build coming soon
            </span>
          )}
          <span className="text-[11px] uppercase tracking-[0.06em]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
            {hasBuild ? `Universal · Apple silicon + Intel · macOS ${minMac}+` : "First release publishing shortly"}
          </span>
        </div>
      </section>

      {/* Widget row — DESIGN.md signature numbered panels */}
      <section className="mx-auto max-w-[1180px] px-6 pb-6 sm:px-8">
        <div className="grid gap-3 lg:grid-cols-3">
          {/* 01 // RELEASE */}
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">01</span>{" // RELEASE"}
              </span>
              <span className="widget-header__status">
                <span className={`widget-status-dot ${meta?.notarized ? "widget-status-dot--success" : "widget-status-dot--info"}`} />
                {meta?.notarized ? "Notarized" : hasBuild ? "Signed" : "Pending"}
              </span>
            </div>
            <div className="widget-body">
              <div className="widget-stat">{dash(meta?.version)}</div>
              <div className="widget-data-label mt-1">Version{meta?.build ? ` · Build ${meta.build}` : ""}</div>
              <dl className="mt-6 space-y-3">
                <DataRow label="Architecture" value={arch} />
                <DataRow label="Minimum macOS" value={minMac} />
                <DataRow label="Released" value={releaseDate} />
              </dl>
            </div>
          </div>

          {/* 02 // INSTALL */}
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">02</span>{" // INSTALL"}
              </span>
            </div>
            <div className="widget-body">
              <ol className="space-y-5">
                {installSteps.map((step) => (
                  <li key={step.n} className="flex gap-3">
                    <span className="text-[12px] font-medium" style={{ fontFamily: mono, color: "var(--brand-700)" }}>{step.n}</span>
                    <span className="text-[14px] leading-6" style={{ color: "var(--text-2)" }}>{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* 03 // UPDATES */}
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">03</span>{" // UPDATES"}
              </span>
              <span className="widget-header__status">Sparkle 2</span>
            </div>
            <div className="widget-body">
              <p className="text-[14px] leading-6" style={{ color: "var(--text-3)" }}>
                You install once. After that Foundry checks for updates and installs them in
                place — no need to return here.
              </p>
              <div className="mt-5 widget-progress" aria-hidden="true">
                <div className="widget-progress__fill" style={{ width: "100%" }} />
              </div>
              <p className="mt-3 text-[12px]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
                Foundry → Check for Updates…
              </p>
              <p className="mt-4 text-[12px] leading-5" style={{ color: "var(--text-4)" }}>
                Every update is cryptographically signed and verified before it installs.
              </p>
            </div>
          </div>
        </div>

        {meta?.notes && meta.notes.length > 0 ? (
          <div className="widget-card mt-3">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">04</span>{" // WHAT’S NEW"}
              </span>
              <span className="widget-header__status">{meta.version ? `v${meta.version}` : ""}</span>
            </div>
            <div className="widget-body">
              <ul className="space-y-2">
                {meta.notes.map((note, i) => (
                  <li key={i} className="flex gap-3 text-[14px] leading-6" style={{ color: "var(--text-2)" }}>
                    <span style={{ color: "var(--brand-600)" }}>—</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      {/* cta-banner-blue — closes the page (DESIGN.md) */}
      <section className="mx-auto max-w-[1180px] px-6 pb-16 sm:px-8">
        <div
          className="px-8 py-12 sm:px-12 sm:py-14"
          style={{ background: "linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)", borderRadius: 14, color: "#fff" }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ fontFamily: mono, color: "rgba(255,255,255,0.7)" }}>
            {"// Already running Foundry?"}
          </p>
          <h2 className="mt-3 max-w-[20ch] text-[32px] leading-[1.15] tracking-[-0.01em]" style={{ fontFamily: "var(--font-display)" }}>
            The whole platform, in your browser too.
          </h2>
          <p className="mt-4 max-w-[48ch] text-[15px] leading-7" style={{ color: "rgba(255,255,255,0.82)" }}>
            Proposals, clients, CodeClear and more — the Mac app and the web app share the same workspace.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/app/docs"
              className="inline-flex items-center rounded-md px-[18px] py-[9px] text-[13px] font-medium"
              style={{ background: "#fff", color: "var(--brand-700)" }}
            >
              Open Foundry Web
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-md px-[18px] py-[9px] text-[13px] font-medium"
              style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.24)" }}
            >
              About Gitwork
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t" style={{ borderColor: "var(--border-2)" }}>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-[11px] uppercase tracking-[0.08em]" style={{ fontFamily: mono, color: "var(--text-4)" }}>
            © 2026 Gitwork · Foundry for Mac
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-4)" }}>
            Future updates happen automatically inside Foundry.
          </p>
        </div>
      </footer>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="widget-data-label" style={{ marginTop: 0 }}>{label}</dt>
      <dd className="text-[14px]" style={{ color: "var(--text-2)" }}>{value}</dd>
    </div>
  );
}
