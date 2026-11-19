"use client";

import { ArrowUpTrayIcon, BoltIcon, ChartBarIcon, ChatBubbleLeftRightIcon, EnvelopeIcon, KeyIcon, StarIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { cn } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import type { ClientHealthScore, SupportSource, TicketPriority, TicketStatus } from "@/types/support";

// ─── health badge ────────────────────────────────────────────────────────────

export const HEALTH_TIER_DOT: Record<ClientHealthScore["tier"], string> = {
  healthy: "bg-emerald-500",
  watch: "bg-amber-400",
  at_risk: "bg-red-500",
};
export const HEALTH_TIER_RING: Record<ClientHealthScore["tier"], string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  watch: "border-amber-200 bg-amber-50 text-amber-700",
  at_risk: "border-red-200 bg-red-50 text-red-600",
};
export const HEALTH_TIER_LABEL: Record<ClientHealthScore["tier"], string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At risk",
};

export function HealthBadge({
  health,
  size = "sm",
}: {
  health: ClientHealthScore;
  size?: "xs" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium transition hover:opacity-80",
          size === "xs" ? "text-[10px]" : "text-[11px]",
          HEALTH_TIER_RING[health.tier],
        )}
        title={`Account health: ${health.score}/100`}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH_TIER_DOT[health.tier])} />
        {HEALTH_TIER_LABEL[health.tier]}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-[10px] border border-[var(--border-2)] bg-white p-3 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-1)]">Account health</span>
            <span className={cn(
              "text-sm font-bold",
              health.tier === "healthy" ? "text-emerald-600" : health.tier === "watch" ? "text-amber-600" : "text-red-500",
            )}>{health.score}/100</span>
          </div>
          <div className="space-y-2">
            {health.factors.map((f) => (
              <div key={f.label}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-3)]">{f.label}</span>
                  <span className="text-[11px] font-medium text-[var(--text-2)]">{f.score}/{f.maxScore}</span>
                </div>
                <p className="text-[10px] text-[var(--text-4)]">{f.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TrendBadge({ delta, previous }: { delta: number; previous?: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  const pct = previous && previous !== 0 ? Math.round(Math.abs(delta / previous) * 100) : null;
  return (
    <span className={cn(
      "ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
      up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
    )}>
      {up ? "▲" : "▼"} {Math.abs(delta)}{pct !== null ? ` (${up ? "+" : "-"}${pct}%)` : ""}
    </span>
  );
}

function HighlightedText({ text, keywords }: { text: string; keywords: string[] }) {
  if (keywords.length === 0) return <>{text}</>;
  const pattern = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5 text-amber-900">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function SourceIcon({ source, className }: { source: SupportSource; className?: string }) {
  const cls = cn("h-4 w-4", className);
  switch (source) {
    case "gmail":
    case "imap":
      return <EnvelopeIcon className={cls} />;
    case "reddit":
    case "instagram":
    case "discord":
      return <ChatBubbleLeftRightIcon className={cls} />;
    case "youtube":
      return <BoltIcon className={cls} />;
    case "stripe":
      return <KeyIcon className={cls} />;
    case "analytics":
      return <ChartBarIcon className={cls} />;
    case "app_reviews":
      return <StarIcon className={cls} />;
    case "webhook":
      return <ArrowUpTrayIcon className={cls} />;
    default:
      return <BoltIcon className={cls} />;
  }
}

export const SOURCE_LABEL: Record<SupportSource, string> = {
  gmail: "Gmail",
  imap: "Email (IMAP/SMTP)",
  reddit: "Reddit",
  instagram: "Instagram",
  youtube: "YouTube",
  discord: "Discord",
  stripe: "Stripe",
  analytics: "Analytics API",
  app_reviews: "App Reviews",
  webhook: "Webhook",
};

export const LIVE_SOURCES: SupportSource[] = ["gmail", "imap", "discord", "reddit", "analytics", "app_reviews", "webhook"];

// IMAP/SMTP provider presets — prefill host/port/security so most setups are just email + app password.
export const IMAP_PRESETS: Record<
  "gmail" | "outlook" | "custom",
  { imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; hint: string }
> = {
  gmail: { imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true, hint: "Requires 2-step verification + an App Password + IMAP enabled on the mailbox." },
  outlook: { imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false, hint: "Some Microsoft 365 tenants block basic auth — may need OAuth (coming later)." },
  custom: { imapHost: "", imapPort: 993, imapSecure: true, smtpHost: "", smtpPort: 465, smtpSecure: true, hint: "" },
};

export const SOURCE_TAGLINE: Partial<Record<SupportSource, string>> = {
  gmail: "Email forwarding via your support inbox",
  imap: "Connect any mailbox via IMAP/SMTP — read & reply, no admin",
  discord: "Monitor channels on a client's server",
  reddit: "Watch public subreddits for mentions",
  analytics: "Pull product metrics into monthly reports",
  app_reviews: "App Store + Play Store reviews, rated & tagged",
  webhook: "Receive messages from any external system",
};

// Mirrors the server-side registry in src/server/support-analytics/index.ts
export const ANALYTICS_ADAPTERS: { key: string; label: string; defaultBaseUrl: string; requiresToken: boolean; hint: string }[] = [
  { key: "fellas", label: "Fellas Loaded", defaultBaseUrl: "https://api.fellasloaded.com", requiresToken: false, hint: "Revenue, subscriptions, trials & audience. Base URL only — the API is public; a JWT is optional." },
  { key: "bigwedge", label: "Big Wedge Golf", defaultBaseUrl: "https://apiv1.bigwedgegolf.com", requiresToken: false, hint: "User analytics, month by month. Foundry logs in with the Big Wedge service account; a token is only a fallback." },
  { key: "firebase", label: "Firebase / Firestore", defaultBaseUrl: "", requiresToken: false, hint: "Paste a service-account JSON (from Firebase Console → Project settings → Service accounts). Then add collections to count per month in the metric specs below." },
  { key: "generic", label: "Generic JSON API", defaultBaseUrl: "", requiresToken: false, hint: "Enter the full endpoint URL — every numeric field becomes a metric." },
];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  dev_review: "Dev review",
  awaiting_customer: "Awaiting customer",
  resolved: "Resolved",
};

export const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-[var(--surface-1)] text-[var(--text-3)]",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  dev_review: "bg-[var(--mist)] text-[var(--brand-700)] border border-[var(--mist-border)]",
  awaiting_customer: "bg-purple-50 text-purple-700 border border-purple-200",
  resolved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

export const PRIORITY_TONE: Record<TicketPriority, string> = {
  urgent: "bg-red-50 text-red-700 border border-red-200",
  high: "bg-amber-50 text-amber-700 border border-amber-200",
  normal: "bg-[var(--surface-1)] text-[var(--text-3)]",
  low: "bg-[var(--surface-1)] text-[var(--text-4)]",
};

// ─── shared modal ────────────────────────────────────────────────────────────

/**
 * Care's form dialog. It was hand-rolled in the legacy /app/support dashboard (no role="dialog",
 * no Escape, no focus trap); it now delegates to the shared <Modal>, so every Care dialog gets the
 * platform's a11y, radius and widget-header. Callers keep the same props.
 */
export function CareModal({
  title,
  onClose,
  children,
  wide,
  fixedHeight = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: "xl" | "2xl" | "3xl" | boolean;
  /** Pin the panel to a fixed height with the body scrolling — matches the platform's 2-col modals. */
  fixedHeight?: boolean;
}) {
  const width = wide === "3xl" ? "max-w-3xl" : wide === "2xl" ? "max-w-2xl" : wide ? "max-w-xl" : "max-w-md";
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      panelClassName={cn("flex w-full flex-col", width, fixedHeight ? "h-[600px] max-h-[85vh]" : "max-h-[90vh]")}
    >
      {fixedHeight ? (
        <div className="flex min-h-0 flex-1 flex-col p-5 sm:p-6">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
      )}
    </Modal>
  );
}
