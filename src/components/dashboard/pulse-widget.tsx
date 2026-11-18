"use client";

import Link from "next/link";
import { usePulseStats, usePulseScans } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import type { WidgetSize } from "@/components/app-overview";
import type { PulseScanListItem } from "@/types/pulse";
import { SkeletonWidget } from "@/components/ui/motion/skeleton";
import { TileHeader } from "@/components/dashboard/tile-header";
import { useCountUp } from "@/components/ui/motion/use-count-up";

/**
 * `NN // PULSE` on Foundry HQ.
 *
 * ── Two sources, deliberately ────────────────────────────────────────────────
 * Internal viewers get the WORKSPACE roll-up (`/api/pulse/stats`) — average health
 * across every client, the green/amber/red split. An EXTERNAL viewer cannot read that
 * (it describes Gitwork's portfolio, not their work) and it 403s for them, which is
 * how this tile came to render a bare em-dash next to the words "avg health" and three
 * grey bars — a statistic about nothing, on the first screen a guest sees.
 *
 * So a guest is shown their OWN scans instead, from the per-viewer-scoped scan list.
 * Same tile, different question: "how is the portfolio" versus "what have I run".
 *
 * ── The empty state is for everyone ──────────────────────────────────────────
 * Zero scans previously rendered "—" and empty bars for ANY viewer, including a fresh
 * workspace. A number that is absent because nothing has happened yet should say so and
 * offer the action, not print a dash.
 */

function scoreColour(score: number | null): string {
  if (score == null) return "text-[var(--text-2)]";
  if (score >= 75) return "text-[var(--success-500)]";
  if (score >= 50) return "text-[var(--warning-500)]";
  return "text-[var(--danger-500)]";
}

/** Nothing scanned yet — say so, and give them the one action that fixes it. */
function EmptyState({ compact }: { compact: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-sm text-[var(--text-2)]">No scans yet</p>
      {!compact ? (
        <p className="max-w-[34ch] text-xs leading-5 text-[var(--text-4)]">
          Paste a URL and Pulse checks it against the full catalogue — security, SEO,
          accessibility, compliance and more.
        </p>
      ) : null}
      <Link
        href="/app/pulse/new"
        className="mt-1 inline-flex items-center rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--brand-800)]"
      >
        Run your first scan
      </Link>
    </div>
  );
}

/** One scan row — name on the left, its score on the right. */
function ScanRow({ scan, size }: { scan: { id: string; projectName: string; healthScore: number | null }; size: "sm" | "md" }) {
  return (
    <Link
      href={`/app/pulse/${scan.id}`}
      className="flex items-center justify-between rounded-[6px] px-2 py-1 transition-colors hover:bg-[var(--surface-1)]"
    >
      <span className={`truncate ${size === "sm" ? "text-xs" : "text-sm"} text-[var(--text-1)]`}>
        {scan.projectName || "Untitled"}
      </span>
      {scan.healthScore != null ? (
        <span
          className={`ml-2 shrink-0 text-[10px] tabular-nums ${scoreColour(scan.healthScore)}`}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {scan.healthScore}
        </span>
      ) : null}
    </Link>
  );
}

function WidgetFrame({
  index,
  status,
  children,
}: {
  index: number;
  status?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <TileHeader index={index} label="PULSE" href="/app/pulse" status={status} statusTone={status ? "danger" : "muted"} />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

const TIER_COLOUR = {
  green: "var(--success-500)",
  amber: "var(--warning-500)",
  red: "var(--danger-500)",
} as const;
const TIER_LABEL = { green: "Healthy", amber: "Needs work", red: "At risk" } as const;

/**
 * Every scanned project as one proportional bar, healthy → at risk, with the counts under
 * it. Three equal-width bars only said whether a tier was empty; this says how the
 * portfolio is split.
 */
function TierDistribution({ tiers }: { tiers: { green: number; amber: number; red: number } }) {
  const total = tiers.green + tiers.amber + tiers.red;
  if (total === 0) return null;
  const order = ["green", "amber", "red"] as const;
  return (
    <div>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-[3px]" role="img" aria-label={order.map((t) => `${tiers[t]} ${TIER_LABEL[t].toLowerCase()}`).join(", ")}>
        {order.map((t) =>
          tiers[t] > 0 ? (
            <span
              key={t}
              className="h-full transition-[width] duration-500"
              style={{ width: `${(tiers[t] / total) * 100}%`, background: TIER_COLOUR[t] }}
              title={`${tiers[t]} ${TIER_LABEL[t].toLowerCase()}`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
        {order.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: TIER_COLOUR[t] }} />
            {tiers[t]} {TIER_LABEL[t].toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PulseWidget({ size, index }: { size: WidgetSize; index: number }) {
  const { isExternal } = usePermissions();

  // Only one of these is ever enabled, so a guest never fires the request that 403s and
  // an internal viewer never pays for a list they are not going to render.
  const statsQuery = usePulseStats(!isExternal);
  const mineQuery = usePulseScans(undefined, isExternal);

  const loading = isExternal ? mineQuery.isLoading : statsQuery.isLoading;
  if (loading) {
    return <SkeletonWidget />;
  }

  // ── A guest: their own scans, and nothing about anyone else's ──────────────
  if (isExternal) {
    const mine: PulseScanListItem[] = mineQuery.data?.scans ?? [];
    if (mine.length === 0) {
      return (
        <WidgetFrame index={index}>
          <EmptyState compact={size === "sm"} />
        </WidgetFrame>
      );
    }

    const scored = mine.filter((s) => typeof s.healthScore === "number");
    const avg = scored.length
      ? Math.round(scored.reduce((t, s) => t + (s.healthScore ?? 0), 0) / scored.length)
      : null;

    return (
      <WidgetFrame index={index}>
        <div className="flex flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
          <div className="flex items-baseline gap-3 px-1">
            <p
              className={`text-2xl tabular-nums leading-none ${scoreColour(avg)}`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {avg ?? "—"}
            </p>
            <p
              className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {/* "your average", never "avg health" — it is about their scans only. */}
              your average
            </p>
            <span
              className="ml-auto text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {mine.length} {mine.length === 1 ? "scan" : "scans"}
            </span>
          </div>
          <div className="mt-2 space-y-0.5">
            {mine.slice(0, size === "sm" ? 3 : 5).map((s) => (
              <ScanRow key={s.id} scan={s} size={size === "sm" ? "sm" : "md"} />
            ))}
          </div>
        </div>
      </WidgetFrame>
    );
  }

  // ── Internal: the workspace roll-up, as before ─────────────────────────────
  const stats = statsQuery.data ?? {
    totalScans: 0,
    completedScans: 0,
    avgHealthScore: null,
    totalCriticalGaps: 0,
    healthTiers: { green: 0, amber: 0, red: 0 },
    recentScans: [] as PulseScanListItem[],
  };

  if (stats.totalScans === 0) {
    return (
      <WidgetFrame index={index}>
        <EmptyState compact={size === "sm"} />
      </WidgetFrame>
    );
  }

  const total = stats.healthTiers.green + stats.healthTiers.amber + stats.healthTiers.red;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  if (size === "sm") {
    return (
      <WidgetFrame index={index} status={stats.totalCriticalGaps > 0 ? `${stats.totalCriticalGaps} CRITICAL` : null}>
        <div className="flex flex-1 flex-col overflow-hidden px-4 pb-3 pt-3">
          <div className="flex items-baseline gap-2">
            <AnimatedScore value={stats.avgHealthScore} />
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
              avg health · {total} project{total === 1 ? "" : "s"}
            </p>
          </div>
          <div className="mt-2.5">
            <TierDistribution tiers={stats.healthTiers} />
          </div>
          <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-hidden">
            {stats.recentScans.slice(0, 2).map((scan) => (
              <ScanRow key={scan.id} scan={scan} size="sm" />
            ))}
          </div>
        </div>
      </WidgetFrame>
    );
  }

  return (
    <WidgetFrame index={index}>
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="flex items-center gap-4">
          <div>
            <p
              className={`text-3xl tabular-nums leading-none ${scoreColour(stats.avgHealthScore)}`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {stats.avgHealthScore ?? "—"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">avg score</p>
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            {(["green", "amber", "red"] as const).map((tier) => (
              <div key={tier} className="flex items-center gap-2">
                <span
                  className="w-8 text-right text-xs tabular-nums text-[var(--text-4)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {pct(stats.healthTiers[tier])}%
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct(stats.healthTiers[tier])}%`,
                      backgroundColor:
                        tier === "green" ? "var(--success-500)"
                        : tier === "amber" ? "var(--warning-500)"
                        : "var(--danger-500)",
                    }}
                  />
                </div>
                <span
                  className="w-4 text-xs tabular-nums text-[var(--text-4)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {stats.healthTiers[tier]}
                </span>
              </div>
            ))}
          </div>

          {stats.totalCriticalGaps > 0 && (
            <div className="rounded-[6px] bg-[var(--danger-50)] px-2 py-1.5 text-center">
              <p
                className="text-xl tabular-nums leading-none text-[var(--danger-500)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {stats.totalCriticalGaps}
              </p>
              <p className="mt-0.5 text-xs text-[var(--danger-500)]">critical</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex-1 overflow-y-auto">
          <p className="mb-1.5 text-xs font-medium text-[var(--text-3)]">Recent scans</p>
          <div className="space-y-0.5">
            {stats.recentScans.slice(0, size === "lg" ? 7 : 4).map((scan) => (
              <ScanRow key={scan.id} scan={scan} size="md" />
            ))}
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
}

/** The average health, counting up when it arrives. */
function AnimatedScore({ value }: { value: number | null }) {
  const shown = useCountUp(value);
  return (
    <p className={`text-2xl tabular-nums leading-none ${scoreColour(value)}`} style={{ fontFamily: "var(--font-display)" }}>
      {value == null ? "—" : shown}
    </p>
  );
}
