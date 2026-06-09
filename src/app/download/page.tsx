import { Metadata } from "next";
import Link from "next/link";
import { ArrowDownTrayIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { readFile } from "fs/promises";
import path from "path";

export const metadata: Metadata = {
  title: "Download Foundry for Mac — Gitwork",
  description: "Download the Foundry native Mac app for macOS 26+.",
  robots: { index: false }, // internal distribution only
};

interface MacManifest {
  version: string;
  build: string;
  releaseDate: string;
  channel: string;
  downloadUrl: string;
  releaseNotes: string;
}

async function getManifest(): Promise<MacManifest | null> {
  try {
    const file = await readFile(
      path.join(process.cwd(), "public", "desktop", "latest-mac.json"),
      "utf8",
    );
    return JSON.parse(file) as MacManifest;
  } catch {
    return null;
  }
}

const FEATURES = [
  "Native macOS 26 design — menu bar, Spotlight, keyboard shortcuts",
  "Dashboard, Portal, Pulse, Tasks and Backstage",
  "Sign in with your Foundry account — same credentials",
  "Automatic updates via Sparkle",
];

export default async function DownloadPage() {
  const manifest = await getManifest();
  const version = manifest?.version ?? "—";
  const build = manifest?.build ?? "—";
  const downloadUrl =
    manifest?.downloadUrl ??
    "https://github.com/Git-Dann/foundry-mac/releases/latest";
  const releaseDate = manifest?.releaseDate
    ? new Date(manifest.releaseDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="min-h-screen bg-[#FAFAF9] px-4 py-16">
      <div className="mx-auto max-w-xl">
        {/* Logo */}
        <div className="mb-10 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/foundry-logo.svg" alt="Foundry" className="h-10 w-auto" />
        </div>

        {/* Card */}
        <div className="rounded-[16px] border border-[rgba(0,0,0,0.08)] bg-white p-8 shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
          {/* Eyebrow */}
          <p
            className="mb-2 text-[11px] font-medium uppercase tracking-[1.4px] text-[#94A3B8]"
            style={{ fontFamily: "var(--font-mono, monospace)" }}
          >
            Native Mac App
          </p>

          {/* Title */}
          <h1
            className="mb-1 text-[38px] font-normal leading-[1.1] tracking-[-0.03em] text-[#0F172A]"
            style={{ fontFamily: "var(--font-display, Georgia), serif" }}
          >
            Foundry for Mac
          </h1>

          {/* Version line */}
          <div className="mb-6 flex items-center gap-3">
            <span
              className="text-[11px] text-[#64748B]"
              style={{ fontFamily: "var(--font-mono, monospace)" }}
            >
              v{version} · build {build}
            </span>
            {releaseDate && (
              <span className="text-[11px] text-[#94A3B8]">{releaseDate}</span>
            )}
          </div>

          {/* Feature list */}
          <ul className="mb-8 space-y-2.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm leading-5 text-[#475569]">{f}</span>
              </li>
            ))}
          </ul>

          {/* Download button */}
          <a
            href={downloadUrl}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#0F172A] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1E293B]"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Download Foundry.dmg
          </a>

          {/* System req note */}
          <p className="mt-3 text-center text-[11px] text-[#94A3B8]">
            Requires macOS 26 (Tahoe) or later · Apple Silicon &amp; Intel
          </p>
        </div>

        {/* Gatekeeper note */}
        <div className="mt-5 rounded-[10px] border border-[rgba(0,0,0,0.06)] bg-[#FFFBEB] px-4 py-3">
          <p
            className="mb-1 text-[10px] font-medium uppercase tracking-[1.2px] text-amber-700"
            style={{ fontFamily: "var(--font-mono, monospace)" }}
          >
            First launch
          </p>
          <p className="text-[12px] leading-5 text-amber-900">
            The app is currently unsigned. After opening the DMG, if macOS blocks it go to{" "}
            <strong>System Settings → Privacy &amp; Security → Open Anyway</strong>, or run:{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px]">
              xattr -dr com.apple.quarantine /Applications/Foundry.app
            </code>
          </p>
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-xs text-[#94A3B8] underline-offset-4 hover:underline"
          >
            Back to Foundry
          </Link>
        </div>
      </div>
    </main>
  );
}
