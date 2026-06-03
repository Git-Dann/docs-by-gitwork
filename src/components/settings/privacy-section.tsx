"use client";

import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";

const RETENTION_ROWS = [
  {
    domain: "Pulse scans",
    retention: "Indefinite",
    notes: "Drift over time matters for monitoring — kept until the workspace is deleted.",
  },
  {
    domain: "Study sessions",
    retention: "Indefinite",
    notes: "Research transcripts and reports.",
  },
  {
    domain: "Care conversations",
    retention: "Indefinite",
    notes: "Customer comms; retention policy not yet enforced.",
  },
  {
    domain: "Audit log",
    retention: "12 months",
    notes: "Will be enforced once the audit log model is in production.",
  },
  {
    domain: "Authentication sessions",
    retention: "30 days",
    notes: "JWT max-age when 'remember me' is enabled.",
  },
];

/** Tiny "ROADMAP" pip used in card headers to mark not-yet-wired sections. */
function RoadmapBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
      Roadmap
    </span>
  );
}

export function PrivacySection() {
  return (
    <div className="proposal-form-theme space-y-6">
      {/* Top-of-page banner so admins immediately know this whole area is forward-looking.
          The individual cards also carry a Roadmap badge so the message stays visible after
          scrolling past the banner. */}
      <div className="rounded-[10px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-[var(--text-2)]">
        <p>
          <strong>Privacy &amp; data is on the roadmap.</strong> The controls below are
          placeholders for what&apos;s coming alongside multi-workspace support — none of them
          are wired yet. We&apos;re surfacing them now so the GDPR / DPA story is mapped out
          and you know what to expect.
        </p>
      </div>

      <SettingsCard number="01" title="Data export" right={<RoadmapBadge />}>
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Export every workspace record as JSON — clients, proposals, Pulse scans, Study reports,
          Care conversations, rate cards, settings. Useful for GDPR, audits, or moving data
          between Gitwork workspaces.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Button type="button" variant="primary" disabled>
            Export workspace JSON
          </Button>
          <span className="text-xs text-[var(--text-4)]">Wired up in the next release.</span>
        </div>
      </SettingsCard>

      <SettingsCard number="02" title="Retention" right={<RoadmapBadge />}>
        <p className="text-sm leading-6 text-[var(--text-3)]">
          What we keep, and for how long. Per-domain retention windows aren&apos;t enforced yet —
          this table shows what&apos;s coming.
        </p>

        <div className="mt-5 overflow-hidden rounded-[10px] border border-[var(--border-2)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-1)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-4)]">
              <tr>
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Retention</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-3)]">
              {RETENTION_ROWS.map((row) => (
                <tr key={row.domain}>
                  <td className="px-4 py-3 font-medium text-[var(--text-1)]">{row.domain}</td>
                  <td className="px-4 py-3 text-[var(--text-2)]">{row.retention}</td>
                  <td className="px-4 py-3 text-[var(--text-3)]">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      <SettingsCard number="03" title="Danger zone" tone="danger" right={<RoadmapBadge />}>
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Permanently removes every record in this workspace — proposals, clients, Pulse scans,
          Study reports, Care conversations, rate cards, team. Cannot be undone. Sign-in is
          revoked for all members.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Button type="button" variant="danger" disabled>
            Delete workspace…
          </Button>
          <span className="text-xs text-[var(--text-4)]">
            Workspace deletion ships once multi-workspace lands.
          </span>
        </div>
      </SettingsCard>
    </div>
  );
}
