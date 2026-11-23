"use client";

/**
 * The Platform button on the Monitors page and its popup: Foundry's own health (scheduled jobs,
 * disk, database, memory, backups, alerts), kept out of the way of the client monitors it sits
 * beside. Platform admins only; everyone else never sees the button. Rules in
 * src/lib/platform-health.ts.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ServerStackIcon } from "@heroicons/react/24/outline";
import { useAccount } from "@/hooks/use-account";
import { getPlatformHealthApi } from "@/lib/api";
import { formatBytes } from "@/lib/disk-watch";
import { judge, overall, type HealthLevel, type Part, type PartKey, type PlatformHealth } from "@/lib/platform-health";
import { cn } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { relTime } from "@/components/clients/wiki/monitor-board";

const MONO = "var(--font-mono)";

/** Colour only for meaning: red a problem, amber worth a look, green fine, grey couldn't read. */
const DOT: Record<HealthLevel, string> = {
  ok: "bg-[var(--success-500)]",
  attention: "bg-[var(--warning-500)]",
  problem: "bg-[var(--danger-500)]",
  unknown: "bg-[var(--text-4)]",
};
const WORD: Record<HealthLevel, string> = { ok: "Fine", attention: "Worth a look", problem: "Needs a look", unknown: "Couldn't read" };

/** `demo` shows it on /demo/monitors, whose sample user isn't a platform admin. The server
 *  route checks the live account whatever this says. */
export function PlatformHealthButton({ demo = false }: { demo?: boolean }) {
  const account = useAccount();
  const allowed = demo || Boolean(account.data?.isPlatformAdmin);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["platform-health"],
    queryFn: () => getPlatformHealthApi(),
    enabled: allowed,
    refetchInterval: open ? 30_000 : 120_000,
  });
  if (!allowed) return null;
  const parts = q.data ? judge(q.data) : null;
  const level: HealthLevel = parts ? overall(parts) : q.isError ? "unknown" : "ok";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-3)] hover:text-[var(--text-1)]"
        style={{ fontFamily: MONO }}
        title={parts ? `Foundry's own health: ${WORD[level].toLowerCase()}` : "Foundry's own health"}
      >
        <ServerStackIcon className="h-3.5 w-3.5" aria-hidden />
        Platform
        {parts || q.isError ? <span aria-hidden className={cn("inline-block h-1.5 w-1.5 rounded-full", DOT[level])} /> : null}
      </button>
      {/* Portalled to <body>: the button sits inside the page's FadeIn, whose transform would
          make a fixed dialog centre on the page instead of the screen (CLAUDE.md §108.3). */}
      {open && typeof document !== "undefined"
        ? createPortal(
            <PlatformHealthDialog open onClose={() => setOpen(false)} health={q.data ?? null} error={q.isError} loading={q.isLoading} />,
            document.body,
          )
        : null}
    </>
  );
}

function PlatformHealthDialog({
  open,
  onClose,
  health,
  error,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  health: PlatformHealth | null;
  error: boolean;
  loading: boolean;
}) {
  const parts = health ? judge(health) : [];
  const [picked, setPicked] = useState<PartKey>("jobs");
  const part = parts.find((p) => p.key === picked) ?? parts[0];
  return (
    <Modal open={open} onClose={onClose} title="01 // PLATFORM" panelClassName="app-dialog-fixed w-full max-w-3xl">
      {!health ? (
        <p className="m-5 text-sm text-[var(--text-3)]">{error ? "Couldn't read the platform's health just now." : loading ? "Reading…" : ""}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)] sm:overflow-hidden">
          <ul className="border-b border-[var(--border-1)] p-2 sm:min-h-0 sm:overflow-y-auto sm:border-b-0 sm:border-r" aria-label="Parts">
            {parts.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => setPicked(p.key)}
                  aria-current={part?.key === p.key}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-[6px] px-3 py-2 text-left",
                    part?.key === p.key ? "bg-[var(--surface-1)]" : "hover:bg-[var(--surface-1)]",
                  )}
                >
                  <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[p.level])} />
                  <span className="min-w-0">
                    <span className="block text-sm text-[var(--text-1)]">{p.label}</span>
                    <span className="block text-xs text-[var(--text-3)]">{p.summary}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-h-0 p-5 sm:overflow-y-auto">{part ? <Detail part={part} health={health} /> : null}</div>
        </div>
      )}
      {health ? (
        <p className="shrink-0 border-t border-[var(--border-1)] px-5 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
          Read {relTime(health.readAt)} · alerts go to Gitwork&apos;s admins{health.alerts.slack ? " and Slack" : ""}
        </p>
      ) : null}
    </Modal>
  );
}

function Detail({ part, health }: { part: Part; health: PlatformHealth }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
        {WORD[part.level]}
      </p>
      <h3 className="mt-1 text-lg text-[var(--text-1)]">{part.label}</h3>
      <div className="mt-3 text-sm text-[var(--text-2)]">{body(part.key, health)}</div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "problem" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-1)] py-1.5 last:border-b-0">
      <span className="text-[var(--text-2)]">{label}</span>
      <span className={cn("text-right tabular-nums", tone === "problem" ? "font-medium text-red-700" : "text-[var(--text-1)]")}>{value}</span>
    </div>
  );
}

function body(key: PartKey, h: PlatformHealth): React.ReactNode {
  switch (key) {
    case "jobs":
      if (!h.jobs) return <p>Couldn&apos;t read when the jobs last ran.</p>;
      return (
        <>
          <p className="mb-2">Every job in the server&apos;s schedule and when it last ran. One that goes past its longest gap is reported once.</p>
          {[...h.jobs]
            .sort((a, b) => Number(b.stale) - Number(a.stale) || a.name.localeCompare(b.name))
            .map((j) => (
              <Row
                key={j.name}
                label={j.name}
                value={j.lastRun ? `${relTime(j.lastRun)}${j.stale ? " · stopped" : ""}` : j.stale ? "never · stopped" : "not yet"}
                tone={j.stale ? "problem" : undefined}
              />
            ))}
          <p className="mt-2 text-xs text-[var(--text-3)]">&quot;Not yet&quot;: hasn&apos;t come round since the watch began, still inside its gap.</p>
        </>
      );
    case "disk":
      if (!h.disk) return <p>Couldn&apos;t read the disk.</p>;
      return (
        <>
          <Row label="Used" value={`${Math.round(h.disk.usedShare * 100)}%`} tone={h.disk.usedShare >= 0.8 ? "problem" : undefined} />
          <Row label="Free" value={formatBytes(h.disk.freeBytes)} />
          <Row label="Size" value={formatBytes(h.disk.totalBytes)} />
          <p className="mt-2 text-xs text-[var(--text-3)]">Alerts at 80% used. Postgres stops accepting writes when the disk fills.</p>
        </>
      );
    case "database":
      if (!h.database || h.database.bytes == null) return <p>Couldn&apos;t read the database&apos;s size.</p>;
      return (
        <>
          <Row label="Size now" value={formatBytes(h.database.bytes)} />
          <Row label="A week ago" value={h.database.weekAgoBytes != null ? formatBytes(h.database.weekAgoBytes) : "No reading yet"} />
          <Row
            label="Growth"
            value={h.database.growthShare != null ? `${Math.round(h.database.growthShare * 100)}%` : "Known after a week"}
          />
          <p className="mt-2 text-xs text-[var(--text-3)]">One reading a day. Alerts when it grows 25% and 1 GB or more in a week.</p>
        </>
      );
    case "memory":
      if (!h.memory) return <p>Couldn&apos;t read the app&apos;s memory.</p>;
      return (
        <>
          <Row label="App using" value={formatBytes(h.memory.usedBytes)} />
          <Row label="App's cap" value={h.memory.limitBytes ? formatBytes(h.memory.limitBytes) : "None"} />
          <Row label="App's peak" value={h.memory.peakBytes ? formatBytes(h.memory.peakBytes) : "Not recorded"} />
          <Row label="Server" value={formatBytes(h.memory.hostBytes)} />
          <p className="mt-2 text-xs text-[var(--text-3)]">Past its cap the app is restarted on its own, so it can&apos;t starve the database.</p>
        </>
      );
    case "backups":
      return (
        <>
          <Row
            label="State"
            value={h.backups.state === "on" ? "On, daily at 03:45" : h.backups.state === "off" ? "Off" : "Set up wrongly"}
            tone={h.backups.state === "misconfigured" ? "problem" : undefined}
          />
          <Row label="Last good backup" value={h.backups.lastOk ? relTime(h.backups.lastOk) : "None yet"} />
          {h.backups.reason ? <p className="mt-2 text-xs text-red-700">{h.backups.reason}</p> : null}
          {h.backups.state === "off" ? (
            <p className="mt-2 text-xs text-[var(--text-3)]">Switches on once the BACKUP_S3_* and BACKUP_ENCRYPTION_KEY secrets are set. Until then there is only the weekly copy on the same server.</p>
          ) : null}
        </>
      );
    case "restore": {
      const r = h.restore;
      const state =
        r.state === "off" ? "Off" : r.state === "misconfigured" ? "Set up wrongly" : r.state === "never" ? "On, not run yet" : r.state === "failed" ? "Failed" : r.state === "overdue" ? "Overdue" : "Passed";
      const lastPassed = r.state === "passed" ? r.at : r.state === "overdue" || r.state === "failed" ? r.lastPassed : null;
      return (
        <>
          <p className="mb-2">
            On the 2nd of each month the newest off-site backup is restored into a throwaway database on the same server, its row counts are checked against production, and it is dropped. Production&apos;s data is only read.
          </p>
          <Row label="State" value={state} tone={r.state === "failed" || r.state === "overdue" || r.state === "misconfigured" ? "problem" : undefined} />
          <Row label="Last passed" value={lastPassed ? relTime(lastPassed) : "Never"} />
          {r.state === "failed" ? <Row label="Last failed" value={relTime(r.at)} tone="problem" /> : null}
          {r.state === "failed" ? <p className="mt-2 text-xs text-[var(--text-3)]">The reason is in the ops alert sent when it failed.</p> : null}
          {r.state === "misconfigured" ? <p className="mt-2 text-xs text-red-700">{r.reason}</p> : null}
          {r.state === "off" ? (
            <p className="mt-2 text-xs text-[var(--text-3)]">Switches on with the off-site backups: the same BACKUP_S3_* and BACKUP_ENCRYPTION_KEY secrets.</p>
          ) : null}
        </>
      );
    }
    case "alerts":
      return (
        <>
          <Row label="In Foundry" value="On, to Gitwork's admins" />
          <Row label="Slack" value={h.alerts.slack ? "On" : "Off"} />
          {!h.alerts.slack ? (
            <p className="mt-2 text-xs text-[var(--text-3)]">Set the SLACK_OPS_WEBHOOK_URL secret so alerts (and server errors) reach Slack even when nobody has Foundry open.</p>
          ) : null}
        </>
      );
  }
}

